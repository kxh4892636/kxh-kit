// 移植自 difit 上游 src/server/server.ts 的 Express 路由, 改为无 HTTP server 的
// 纯函数路由: preload bridge 把 renderer 的 /api/* fetch 序列化后经 IPC 送到这里。
// 本模块不依赖 electron, 便于 Vitest 直接单测; IPC 接线见 ipc.ts。
// 与上游的差异: 裁掉 stdin diff、CLI 评论导入、heartbeat 自杀逻辑与 /api/comment-imports
// (client 不调用); open-in-editor 固定返回不可用 (编辑器打开属于后续 issue);
// 上游的 diff LRU 缓存依赖文件监听失效回调, 本 issue watch 为 stub, 为避免展示过期
// diff 而整体移除, 每次请求都实时解析。
import { createHash } from "crypto";
import { isAbsolute, resolve, sep } from "path";

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

import { createCommentSessionStore, parseCommentPushBody } from "./comment-sessions.js";
import { GitDiffParser } from "./git-diff.js";
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

const errorResponse = (status: number, message: string): ApiBridgeResponse =>
  jsonResponse({ error: message }, status);

const parseJsonBody = (body: string | undefined): unknown => {
  if (body === undefined || body === "") {
    return {};
  }
  return JSON.parse(body) as unknown;
};

const parseBaseMode = (value: unknown): BaseMode | undefined =>
  value === "merge-base" ? "merge-base" : undefined;

export const createApiRouter = (options: ApiRouterOptions): ApiRouter => {
  const { parser, repoPath, configPath } = options;
  const repositoryPath = resolve(repoPath);
  const repositoryId = createHash("sha256").update(repositoryPath).digest("hex");
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

  const parseRepositoryRelativePath = (
    filepath: unknown,
  ):
    | { ok: true; path: string }
    | { ok: false; error: "Invalid file path" | "File path outside repository" } => {
    if (typeof filepath !== "string" || filepath.length === 0) {
      return { ok: false, error: "Invalid file path" };
    }

    const normalizedFilepath = filepath.replace(/\\/g, "/");
    const hasParentTraversal = normalizedFilepath.split("/").some((segment) => segment === "..");
    if (isAbsolute(filepath) || normalizedFilepath.startsWith("/") || hasParentTraversal) {
      return { ok: false, error: "File path outside repository" };
    }

    const resolvedPath = resolve(repositoryPath, normalizedFilepath);
    if (resolvedPath !== repositoryPath && !resolvedPath.startsWith(`${repositoryPath}${sep}`)) {
      return { ok: false, error: "File path outside repository" };
    }

    return { ok: true, path: normalizedFilepath };
  };

  const getCommentSelectionFromQuery = (query: Record<string, string>): DiffSelection => {
    const hasBase = typeof query.base === "string";
    const hasTarget = typeof query.target === "string";
    const hasBaseMode = typeof query.baseMode === "string";

    if (!hasBase && !hasTarget && !hasBaseMode) {
      return currentCommentSelection;
    }

    return createDiffSelection(
      hasBase ? (query.base as string) : currentCommentSelection.baseCommitish,
      hasTarget ? (query.target as string) : currentCommentSelection.targetCommitish,
      hasBaseMode
        ? parseBaseMode(query.baseMode)
        : hasBase || hasTarget
          ? undefined
          : currentCommentSelection.baseMode,
    );
  };

  const handleDiff = async (request: ApiBridgeRequest): Promise<ApiBridgeResponse> => {
    const { query } = request;
    const ignoreWhitespace = query.ignoreWhitespace === "true";
    const hasBase = typeof query.base === "string";
    const hasTarget = typeof query.target === "string";
    const hasBaseMode = typeof query.baseMode === "string";
    const requestedSelection = createDiffSelection(
      hasBase ? (query.base as string) : currentSelection.baseCommitish,
      hasTarget ? (query.target as string) : currentSelection.targetCommitish,
      hasBaseMode
        ? parseBaseMode(query.baseMode)
        : hasBase || hasTarget
          ? undefined
          : currentSelection.baseMode,
    );

    let responseDiffData;
    try {
      responseDiffData = await parser.parseDiff(requestedSelection, ignoreWhitespace);
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
        await parser.getRevisionOptions(
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
      const filepathResult = parseRepositoryRelativePath(filepath);
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

      const status = await parser.getGeneratedStatus(normalizedFilepath, ref);
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
      const filepathResult = parseRepositoryRelativePath(filepath);
      if (!filepathResult.ok) {
        return errorResponse(400, filepathResult.error);
      }
      const normalizedFilepath = filepathResult.path;
      const oldRef = query.oldRef;
      const oldPathResult = query.oldPath
        ? parseRepositoryRelativePath(query.oldPath)
        : { ok: true as const, path: normalizedFilepath };
      if (!oldPathResult.ok) {
        return errorResponse(400, oldPathResult.error);
      }
      const newRef = query.newRef;
      const oldPath = oldPathResult.path;

      const result: { oldLineCount?: number; newLineCount?: number } = {};

      if (oldRef) {
        try {
          result.oldLineCount = await parser.getLineCount(oldPath, oldRef);
        } catch {
          result.oldLineCount = 0;
        }
      }
      if (newRef) {
        try {
          result.newLineCount = await parser.getLineCount(normalizedFilepath, newRef);
        } catch {
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
      const filepathResult = parseRepositoryRelativePath(filepath);
      if (!filepathResult.ok) {
        return errorResponse(400, filepathResult.error);
      }
      const ref = query.ref || "HEAD";

      const blob = await parser.getBlobContent(filepathResult.path, ref);

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
      patch = parseUserSettingsPatch(parseJsonBody(request.body));
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
