// 移植自 difit 上游 src/server/server.ts 的 Express 路由, 改为无 HTTP server 的
// 纯函数路由: preload bridge 把 renderer 的 /api/* fetch 序列化后经 IPC 送到这里。
// 本模块不依赖 electron, 便于 Vitest 直接单测; IPC 接线见 ipc.ts。
// 与上游的差异: 裁掉 stdin diff、CLI 评论导入、heartbeat 自杀逻辑与 /api/comment-imports
// (client 不调用); open-in-editor 固定返回不可用 (编辑器打开属于后续 issue);
// 上游的 diff LRU 缓存依赖文件监听失效回调, 本 issue watch 为 stub, 为避免展示过期
// diff 而整体移除, 每次请求都实时解析。
import { createHash } from "crypto";
import { isAbsolute, resolve } from "path";

import type { ApiBridgeRequest, ApiBridgeResponse } from "../api-bridge/api-bridge-types.js";
import {
  type BaseMode,
  type DiffSelection,
  type GeneratedStatusResponse,
  type RevisionsResponse,
} from "../types/diff.js";
import { DiffMode, type WatchEvent } from "../types/watch.js";
import { createDiffSelection } from "../utils/diffSelection.js";
import { getFileExtension } from "../utils/fileUtils.js";

import {
  createCommentSessionStore,
  parseBodyObject,
  parseCommentPushBody,
} from "./comment-sessions.js";
import { GitDiffParser } from "./git-diff.js";
import { resolveInitialSelection } from "./initial-selection.js";
import { parseUserSettingsPatch, readUserConfig, updateUserClientSettings } from "./user-config.js";

export interface ApiRouterOptions {
  parser: GitDiffParser;
  repoPath: string;
  initialSelection: DiffSelection;
  configPath: string;
  // 评论变化时向 renderer 广播 (经 watch 通道)
  broadcast?: (payload: string) => void;
}

export interface ApiRouter {
  handle: (request: ApiBridgeRequest) => Promise<ApiBridgeResponse>;
  // watch 连接建立时立即推送的事件 (JSON 字符串, 对应 SSE 的 data 帧)
  getInitialWatchEvents: () => string[];
}

const GENERATED_STATUS_CACHE_TTL_MS = 60_000;

const BLOB_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

const jsonResponse = (data: unknown, status = 200): ApiBridgeResponse => ({
  status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

// 仓库标识 = 已 resolve 绝对路径的 sha256, 供 client 按仓库隔离评论/已读状态
const computeRepositoryId = (repoPath: string): string =>
  createHash("sha256").update(resolve(repoPath)).digest("hex");

const errorResponse = (status: number, message: string): ApiBridgeResponse =>
  jsonResponse({ error: message }, status);

const parseBaseMode = (value: unknown): BaseMode | undefined =>
  value === "merge-base" ? "merge-base" : undefined;

// base/target/baseMode 查询参数 → DiffSelection, 未提供的字段回退到 fallback。
// 约定: 显式给了 base 或 target 而未给 baseMode 时, baseMode 重置 (回到两点对比)
const selectionFromQuery = (
  query: Record<string, string>,
  fallback: DiffSelection,
): DiffSelection => {
  const hasBase = typeof query.base === "string";
  const hasTarget = typeof query.target === "string";
  const hasBaseMode = typeof query.baseMode === "string";

  if (!hasBase && !hasTarget && !hasBaseMode) {
    return fallback;
  }

  return createDiffSelection(
    hasBase ? query.base : fallback.baseCommitish,
    hasTarget ? query.target : fallback.targetCommitish,
    hasBaseMode
      ? parseBaseMode(query.baseMode)
      : hasBase || hasTarget
        ? undefined
        : fallback.baseMode,
  );
};

export const createApiRouter = (options: ApiRouterOptions): ApiRouter => {
  const { configPath } = options;
  // 激活仓库可经 POST /api/active-repository 切换 (issue 03 侧栏仓库树勾选):
  // parser / repositoryId / 激活对比随切换整体替换, 各 handler 始终读取当前值
  let activeParser = options.parser;
  let repositoryId = computeRepositoryId(options.repoPath);
  const generatedStatusCache = new Map<
    string,
    { value: GeneratedStatusResponse; expiresAt: number }
  >();

  let currentSelection = options.initialSelection;
  let currentCommentSelection = options.initialSelection;

  const commentStore = createCommentSessionStore((_selection, version) => {
    const event: WatchEvent = {
      type: "commentsChanged",
      version,
      timestamp: new Date().toISOString(),
    };
    options.broadcast?.(JSON.stringify(event));
  });

  // 仓库相对路径归一化的唯一实现在 GitDiffParser (port 侧), 这里把抛错映射为 400
  const toRepositoryRelativePath = (
    filepath: string,
  ): { ok: true; path: string } | { ok: false; error: string } => {
    try {
      return { ok: true, path: activeParser.normalizeRepositoryRelativePath(filepath) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Invalid file path" };
    }
  };

  const getCommentSelectionFromQuery = (query: Record<string, string>): DiffSelection =>
    selectionFromQuery(query, currentCommentSelection);

  const handleDiff = async (request: ApiBridgeRequest): Promise<ApiBridgeResponse> => {
    const { query } = request;
    const ignoreWhitespace = query.ignoreWhitespace === "true";
    const requestedSelection = selectionFromQuery(query, currentSelection);

    let responseDiffData;
    try {
      responseDiffData = await activeParser.parseDiff(requestedSelection, ignoreWhitespace);
    } catch (error) {
      console.error("Error fetching diff:", error);
      return errorResponse(500, error instanceof Error ? error.message : "Failed to fetch diff");
    }
    generatedStatusCache.clear();

    currentSelection = requestedSelection;

    const baseCommitish = responseDiffData.baseCommitish ?? undefined;
    const targetCommitish = responseDiffData.targetCommitish ?? undefined;
    currentCommentSelection = createDiffSelection(
      baseCommitish ?? requestedSelection.baseCommitish,
      targetCommitish ?? requestedSelection.targetCommitish,
      responseDiffData.requestedBaseMode ?? requestedSelection.baseMode,
    );

    return jsonResponse({
      ...responseDiffData,
      ignoreWhitespace,
      openInEditorAvailable: false,
      baseCommitish,
      targetCommitish,
      requestedBaseCommitish:
        responseDiffData.requestedBaseCommitish ?? requestedSelection.baseCommitish,
      requestedTargetCommitish:
        responseDiffData.requestedTargetCommitish ?? requestedSelection.targetCommitish,
      requestedBaseMode: responseDiffData.requestedBaseMode ?? requestedSelection.baseMode,
      clearComments: false,
      repositoryId,
    });
  };

  const handleRevisions = async (): Promise<ApiBridgeResponse> => {
    try {
      const { branches, commits, originDefaultBranch, resolvedBase, resolvedTarget } =
        await activeParser.getRevisionOptions(
          currentSelection.baseCommitish,
          currentSelection.targetCommitish,
        );

      const response: RevisionsResponse = {
        specialOptions: [
          { value: ".", label: "All Uncommitted Changes" },
          { value: "staged", label: "Staging Area" },
          { value: "working", label: "Working Directory" },
        ],
        branches,
        commits,
        originDefaultBranch,
        resolvedBase,
        resolvedTarget,
      };

      return jsonResponse(response);
    } catch (error) {
      console.error("Error fetching revisions:", error);
      return errorResponse(500, "Failed to fetch revisions");
    }
  };

  const handleGeneratedStatus = async (
    filepath: string,
    query: Record<string, string>,
  ): Promise<ApiBridgeResponse> => {
    try {
      const filepathResult = toRepositoryRelativePath(filepath);
      if (!filepathResult.ok) {
        return errorResponse(400, filepathResult.error);
      }
      const normalizedFilepath = filepathResult.path;

      const ref = query.ref || currentSelection.targetCommitish || "HEAD";
      const cacheKey = `${ref}:${normalizedFilepath}`;
      const now = Date.now();
      const cached = generatedStatusCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return jsonResponse(cached.value);
      }

      const status = await activeParser.getGeneratedStatus(normalizedFilepath, ref);
      const response: GeneratedStatusResponse = {
        path: normalizedFilepath,
        ref,
        ...status,
      };
      generatedStatusCache.set(cacheKey, {
        value: response,
        expiresAt: now + GENERATED_STATUS_CACHE_TTL_MS,
      });

      return jsonResponse(response);
    } catch (error) {
      console.error("Error fetching generated status:", error);
      return errorResponse(500, "Failed to get generated status");
    }
  };

  const handleLineCount = async (
    filepath: string,
    query: Record<string, string>,
  ): Promise<ApiBridgeResponse> => {
    try {
      const filepathResult = toRepositoryRelativePath(filepath);
      if (!filepathResult.ok) {
        return errorResponse(400, filepathResult.error);
      }
      const normalizedFilepath = filepathResult.path;
      const oldRef = query.oldRef;
      const oldPathResult = query.oldPath
        ? toRepositoryRelativePath(query.oldPath)
        : { ok: true as const, path: normalizedFilepath };
      if (!oldPathResult.ok) {
        return errorResponse(400, oldPathResult.error);
      }
      const newRef = query.newRef;
      const oldPath = oldPathResult.path;

      const result: { oldLineCount?: number; newLineCount?: number } = {};

      // 单侧读取失败不致命 (新增/删除的文件在另一侧不存在), 记 0 行但需留日志
      if (oldRef) {
        try {
          result.oldLineCount = await activeParser.getLineCount(oldPath, oldRef);
        } catch (error) {
          console.error(`Failed to get line count for ${oldPath} at ${oldRef}:`, error);
          result.oldLineCount = 0;
        }
      }
      if (newRef) {
        try {
          result.newLineCount = await activeParser.getLineCount(normalizedFilepath, newRef);
        } catch (error) {
          console.error(`Failed to get line count for ${normalizedFilepath} at ${newRef}:`, error);
          result.newLineCount = 0;
        }
      }

      return jsonResponse(result);
    } catch (error) {
      console.error("Error fetching line count:", error);
      return errorResponse(500, "Failed to get line count");
    }
  };

  const handleBlob = async (
    filepath: string,
    query: Record<string, string>,
  ): Promise<ApiBridgeResponse> => {
    try {
      const filepathResult = toRepositoryRelativePath(filepath);
      if (!filepathResult.ok) {
        return errorResponse(400, filepathResult.error);
      }
      const ref = query.ref || "HEAD";

      const blob = await activeParser.getBlobContent(filepathResult.path, ref);

      const ext = getFileExtension(filepathResult.path);
      const contentType = (ext && BLOB_CONTENT_TYPES[ext]) || "application/octet-stream";

      // Buffer 底层可能共享 pool, 拷贝出独立 ArrayBuffer 再经 IPC 传输
      const bytes = new Uint8Array(blob.byteLength);
      bytes.set(blob);
      return {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
        blob: bytes.buffer,
      };
    } catch (error) {
      console.error("Error fetching blob:", error);
      return errorResponse(404, "File not found");
    }
  };

  const handlePostComments = async (request: ApiBridgeRequest): Promise<ApiBridgeResponse> => {
    try {
      const selection = getCommentSelectionFromQuery(request.query);
      const { threads, baseVersion } = parseCommentPushBody(request.body);
      const result = commentStore.replaceThreads(selection, threads, baseVersion);

      return jsonResponse({
        success: true,
        merged: result.merged,
        version: result.version,
        threads: result.threads,
      });
    } catch (error) {
      console.error("Error parsing comments:", error);
      return errorResponse(400, "Invalid comment data");
    }
  };

  const handleDeleteComment = async (
    request: ApiBridgeRequest,
    threadId: string,
  ): Promise<ApiBridgeResponse> => {
    const selection = getCommentSelectionFromQuery(request.query);
    const result = commentStore.deleteThread(selection, threadId);

    if (!result.found) {
      return errorResponse(404, `Thread not found: ${threadId}`);
    }

    return jsonResponse({ success: true, threadId, version: result.version });
  };

  const handleUserSettingsRead = async (): Promise<ApiBridgeResponse> => {
    const config = await readUserConfig(configPath);
    return jsonResponse(config);
  };

  const handleUserSettingsWrite = async (request: ApiBridgeRequest): Promise<ApiBridgeResponse> => {
    let patch: Record<string, unknown> | null;
    try {
      patch = parseUserSettingsPatch(parseBodyObject(request.body));
    } catch {
      patch = null;
    }

    if (!patch) {
      return errorResponse(400, "Invalid user settings payload");
    }

    try {
      const config = await updateUserClientSettings(patch, configPath);
      return jsonResponse(config);
    } catch (error) {
      console.error("Error saving user settings:", error);
      return errorResponse(500, "Failed to save user settings");
    }
  };

  // issue 03: 侧栏仓库树勾选后切换激活仓库。parser / repositoryId / 激活对比整体替换;
  // 目标不是 git 仓库时拒绝并保持原状态, 由 UI 提示重新选择
  const handleSetActiveRepository = async (
    request: ApiBridgeRequest,
  ): Promise<ApiBridgeResponse> => {
    let body: unknown;
    try {
      body = parseBodyObject(request.body);
    } catch {
      return errorResponse(400, "Invalid active repository payload");
    }
    const candidate =
      body !== null && typeof body === "object" ? (body as { path?: unknown }).path : undefined;
    if (typeof candidate !== "string" || candidate.length === 0 || !isAbsolute(candidate)) {
      return errorResponse(400, "Invalid repository path");
    }

    const nextParser = new GitDiffParser(candidate);
    let nextSelection: DiffSelection;
    try {
      nextSelection = await resolveInitialSelection(nextParser);
    } catch (error) {
      console.error(`Failed to activate repository at ${candidate}:`, error);
      return errorResponse(400, `Not a git repository: ${candidate}`);
    }

    activeParser = nextParser;
    repositoryId = computeRepositoryId(candidate);
    currentSelection = nextSelection;
    currentCommentSelection = nextSelection;
    generatedStatusCache.clear();

    return jsonResponse({ path: resolve(candidate), selection: nextSelection });
  };

  const route = async (request: ApiBridgeRequest): Promise<ApiBridgeResponse> => {
    const { method, path, query } = request;

    if (method === "GET" && path === "/api/diff") {
      return handleDiff(request);
    }
    if (method === "GET" && path === "/api/revisions") {
      return handleRevisions();
    }
    if (method === "GET" && path.startsWith("/api/generated-status/")) {
      return handleGeneratedStatus(
        decodeURIComponent(path.slice("/api/generated-status/".length)),
        query,
      );
    }
    if (method === "GET" && path.startsWith("/api/line-count/")) {
      return handleLineCount(decodeURIComponent(path.slice("/api/line-count/".length)), query);
    }
    if (method === "GET" && path.startsWith("/api/blob/")) {
      return handleBlob(decodeURIComponent(path.slice("/api/blob/".length)), query);
    }
    if (method === "POST" && path === "/api/comments") {
      return handlePostComments(request);
    }
    if (method === "DELETE" && path.startsWith("/api/comments/")) {
      return handleDeleteComment(request, path.slice("/api/comments/".length));
    }
    if (method === "GET" && path === "/api/comments-json") {
      const selection = getCommentSelectionFromQuery(query);
      const session = commentStore.getSession(selection);
      return jsonResponse({ version: session.version, threads: session.threads });
    }
    if (method === "GET" && path === "/api/comments-output") {
      const selection = getCommentSelectionFromQuery(query);
      return {
        status: 200,
        headers: { "Content-Type": "text/plain" },
        body: commentStore.formatOutput(selection),
      };
    }
    if (method === "GET" && path === "/api/user-settings") {
      return handleUserSettingsRead();
    }
    if (method === "PUT" && path === "/api/user-settings") {
      return handleUserSettingsWrite(request);
    }
    if (method === "POST" && path === "/api/active-repository") {
      return handleSetActiveRepository(request);
    }
    if (method === "POST" && path === "/api/open-in-editor") {
      // 编辑器打开属于后续 issue, 本骨架版本固定不可用
      return errorResponse(400, "Open in editor is not available in this build");
    }

    return errorResponse(404, `Unknown API endpoint: ${method} ${path}`);
  };

  return {
    handle: route,
    getInitialWatchEvents: () => {
      // watch 目前是无文件监听的 stub: @parcel/watcher 为 native 模块,
      // 为避免 Electron ABI 负担本 issue 先放弃文件变化自动刷新
      const event: WatchEvent = {
        type: "connected",
        diffMode: DiffMode.SPECIFIC,
        changeType: "commit",
        timestamp: new Date().toISOString(),
        message: "File watching is not enabled in this build",
      };
      return [JSON.stringify(event)];
    },
  };
};
