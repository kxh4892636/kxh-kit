// 移植自 difit 上游 src/server/server.ts 的 Express 路由, 改为无 HTTP server 的
// 纯函数路由: preload bridge 把 renderer 的 /api/* fetch 序列化后经 IPC 送到这里。
// 本模块不依赖 electron, 便于 Vitest 直接单测; IPC 接线见 ipc.ts。
// 与上游的差异: 裁掉 stdin diff、CLI 评论导入、heartbeat 自杀逻辑与 /api/comment-imports
// (client 不调用); open-in-editor 固定返回不可用 (编辑器打开属于后续 issue);
// 上游的 diff LRU 缓存依赖文件监听失效回调, 本 issue watch 为 stub, 为避免展示过期
// diff 而整体移除, 每次请求都实时解析。
// issue 04: parser 状态重构为按仓库 keyed 的多会话管理 (repo-sessions.ts)——
// /api/* 携带 repo 参数 (绝对路径) 路由到对应仓库会话, 省略时落到当前聚焦会话;
// 各仓库的激活对比/评论会话/generated 缓存互相独立, 切换仓库互不覆盖。
// issue 05: 评论会话经 comment-persistence.ts 落盘到 commentsDir (userData/comments/
// <repositoryId>.json), 路由处理评论读写前一律先 hydrate, 变更响应前等 persisted 落盘。
import { isAbsolute, join } from "path";

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
  type CommentSessionStore,
} from "./comment-sessions.js";
import { createCommentPersister } from "./comment-persistence.js";
import { createRepoSessionManager, type RepoSession } from "./repo-sessions.js";
import type { GitDiffParser } from "./git-diff.js";
import { parseUserSettingsPatch, readUserConfig, updateUserClientSettings } from "./user-config.js";

export interface ApiRouterOptions {
  parser: GitDiffParser;
  repoPath: string;
  initialSelection: DiffSelection;
  configPath: string;
  // 评论落盘目录 (userData/comments); 每仓库一个 <repositoryId>.json
  commentsDir: string;
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

// 仓库标识计算已移入 repo-sessions (会话创建时一并生成)
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
  // issue 04: 按仓库 keyed 的会话管理 (取代 03 的单 parser 整体替换)。
  // 无 repo 参数的请求落到聚焦会话; 聚焦指针由 POST /api/active-repository 移动,
  // 与 client 主视图展示的仓库一致 —— fork client 的 line-count/blob/generated-status
  // 等请求不带 repo 参数, 靠此指针路由到正确仓库
  const sessionManager = createRepoSessionManager({
    repoPath: options.repoPath,
    parser: options.parser,
    initialSelection: options.initialSelection,
  });

  // 评论会话按仓库隔离: store 以 selection 为键, 跨仓库共用会在相同对比下串评论;
  // issue 05 起每个仓库的会话经独立 persister 落盘 (每仓库一个 JSON 文件)
  const commentStores = new Map<string, CommentSessionStore>();
  const commentStoreFor = (session: RepoSession): CommentSessionStore => {
    const existing = commentStores.get(session.repoPath);
    if (existing) {
      return existing;
    }
    const store = createCommentSessionStore(
      (_selection, version) => {
        const event: WatchEvent = {
          type: "commentsChanged",
          version,
          timestamp: new Date().toISOString(),
        };
        options.broadcast?.(JSON.stringify(event));
      },
      createCommentPersister({
        filePath: join(options.commentsDir, `${session.repositoryId}.json`),
        repoPath: session.repoPath,
      }),
    );
    commentStores.set(session.repoPath, store);
    return store;
  };

  // repo 参数路由守卫: 解析目标仓库会话, 未激活时直接 400; 各仓库作用域端点共用
  const withSession = (
    query: Record<string, string>,
    handler: (session: RepoSession) => Promise<ApiBridgeResponse>,
  ): Promise<ApiBridgeResponse> => {
    const lookup = sessionManager.resolveForRequest(query.repo);
    if (!lookup.ok) {
      return Promise.resolve(errorResponse(400, lookup.error));
    }
    return handler(lookup.session);
  };

  // 仓库相对路径归一化的唯一实现在 GitDiffParser (port 侧), 这里把抛错映射为 400
  const toRepositoryRelativePath = (
    session: RepoSession,
    filepath: string,
  ): { ok: true; path: string } | { ok: false; error: string } => {
    try {
      return { ok: true, path: session.parser.normalizeRepositoryRelativePath(filepath) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Invalid file path" };
    }
  };

  const getCommentSelectionFromQuery = (
    session: RepoSession,
    query: Record<string, string>,
  ): DiffSelection => selectionFromQuery(query, session.currentCommentSelection);

  const handleDiff = async (
    session: RepoSession,
    request: ApiBridgeRequest,
  ): Promise<ApiBridgeResponse> => {
    const { query } = request;
    const ignoreWhitespace = query.ignoreWhitespace === "true";
    const requestedSelection = selectionFromQuery(query, session.currentSelection);

    let responseDiffData;
    try {
      responseDiffData = await session.parser.parseDiff(requestedSelection, ignoreWhitespace);
    } catch (error) {
      console.error("Error fetching diff:", error);
      return errorResponse(500, error instanceof Error ? error.message : "Failed to fetch diff");
    }
    session.generatedStatusCache.clear();

    session.currentSelection = requestedSelection;

    const baseCommitish = responseDiffData.baseCommitish ?? undefined;
    const targetCommitish = responseDiffData.targetCommitish ?? undefined;
    session.currentCommentSelection = createDiffSelection(
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
      repositoryId: session.repositoryId,
    });
  };

  const handleRevisions = async (session: RepoSession): Promise<ApiBridgeResponse> => {
    try {
      const { branches, commits, originDefaultBranch, resolvedBase, resolvedTarget } =
        await session.parser.getRevisionOptions(
          session.currentSelection.baseCommitish,
          session.currentSelection.targetCommitish,
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
    session: RepoSession,
    filepath: string,
    query: Record<string, string>,
  ): Promise<ApiBridgeResponse> => {
    try {
      const filepathResult = toRepositoryRelativePath(session, filepath);
      if (!filepathResult.ok) {
        return errorResponse(400, filepathResult.error);
      }
      const normalizedFilepath = filepathResult.path;

      const ref = query.ref || session.currentSelection.targetCommitish || "HEAD";
      const cacheKey = `${ref}:${normalizedFilepath}`;
      const now = Date.now();
      const cached = session.generatedStatusCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return jsonResponse(cached.value);
      }

      const status = await session.parser.getGeneratedStatus(normalizedFilepath, ref);
      const response: GeneratedStatusResponse = {
        path: normalizedFilepath,
        ref,
        ...status,
      };
      session.generatedStatusCache.set(cacheKey, {
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
    session: RepoSession,
    filepath: string,
    query: Record<string, string>,
  ): Promise<ApiBridgeResponse> => {
    try {
      const filepathResult = toRepositoryRelativePath(session, filepath);
      if (!filepathResult.ok) {
        return errorResponse(400, filepathResult.error);
      }
      const normalizedFilepath = filepathResult.path;
      const oldRef = query.oldRef;
      const oldPathResult = query.oldPath
        ? toRepositoryRelativePath(session, query.oldPath)
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
          result.oldLineCount = await session.parser.getLineCount(oldPath, oldRef);
        } catch (error) {
          console.error(`Failed to get line count for ${oldPath} at ${oldRef}:`, error);
          result.oldLineCount = 0;
        }
      }
      if (newRef) {
        try {
          result.newLineCount = await session.parser.getLineCount(normalizedFilepath, newRef);
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
    session: RepoSession,
    filepath: string,
    query: Record<string, string>,
  ): Promise<ApiBridgeResponse> => {
    try {
      const filepathResult = toRepositoryRelativePath(session, filepath);
      if (!filepathResult.ok) {
        return errorResponse(400, filepathResult.error);
      }
      const ref = query.ref || "HEAD";

      const blob = await session.parser.getBlobContent(filepathResult.path, ref);

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

  const handlePostComments = async (
    session: RepoSession,
    request: ApiBridgeRequest,
  ): Promise<ApiBridgeResponse> => {
    try {
      const selection = getCommentSelectionFromQuery(session, request.query);
      const { threads, baseVersion } = parseCommentPushBody(request.body);
      const store = commentStoreFor(session);
      await store.hydrate();
      const result = store.replaceThreads(selection, threads, baseVersion);
      // 响应前等落盘: 调用方 (含 e2e 重启断言) 依赖 200 = 已持久化
      await result.persisted;

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
    session: RepoSession,
    request: ApiBridgeRequest,
    threadId: string,
  ): Promise<ApiBridgeResponse> => {
    const store = commentStoreFor(session);
    await store.hydrate();
    const selection = getCommentSelectionFromQuery(session, request.query);
    const result = store.deleteThread(selection, threadId);
    await result.persisted;

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

  // issue 04: 勾选侧栏仓库树条目激活仓库。语义从 03 的"整体替换"改为幂等激活:
  // 已激活仓库仅移动聚焦指针 (其激活对比由会话保持, 互不覆盖); 新仓库创建会话并
  // 解析默认对比; 目标不是 git 仓库时拒绝并保持原聚焦, 由 UI 提示重新选择
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

    const activated = await sessionManager.activate(candidate);
    if (!activated.ok) {
      console.error(`Failed to activate repository at ${candidate}: ${activated.error}`);
      return errorResponse(400, activated.error);
    }

    return jsonResponse({
      path: activated.session.repoPath,
      selection: activated.session.currentSelection,
    });
  };

  const route = async (request: ApiBridgeRequest): Promise<ApiBridgeResponse> => {
    const { method, path, query } = request;

    if (method === "GET" && path === "/api/diff") {
      return withSession(query, (session) => handleDiff(session, request));
    }
    if (method === "GET" && path === "/api/revisions") {
      return withSession(query, handleRevisions);
    }
    if (method === "GET" && path.startsWith("/api/generated-status/")) {
      return withSession(query, (session) =>
        handleGeneratedStatus(
          session,
          decodeURIComponent(path.slice("/api/generated-status/".length)),
          query,
        ),
      );
    }
    if (method === "GET" && path.startsWith("/api/line-count/")) {
      return withSession(query, (session) =>
        handleLineCount(session, decodeURIComponent(path.slice("/api/line-count/".length)), query),
      );
    }
    if (method === "GET" && path.startsWith("/api/blob/")) {
      return withSession(query, (session) =>
        handleBlob(session, decodeURIComponent(path.slice("/api/blob/".length)), query),
      );
    }
    if (method === "POST" && path === "/api/comments") {
      return withSession(query, (session) => handlePostComments(session, request));
    }
    if (method === "DELETE" && path.startsWith("/api/comments/")) {
      return withSession(query, (session) =>
        handleDeleteComment(session, request, path.slice("/api/comments/".length)),
      );
    }
    if (method === "GET" && path === "/api/comments-json") {
      return withSession(query, async (session) => {
        const selection = getCommentSelectionFromQuery(session, query);
        const store = commentStoreFor(session);
        await store.hydrate();
        const commentSession = store.getSession(selection);
        return jsonResponse({ version: commentSession.version, threads: commentSession.threads });
      });
    }
    if (method === "GET" && path === "/api/comments-output") {
      return withSession(query, async (session) => {
        const selection = getCommentSelectionFromQuery(session, query);
        const store = commentStoreFor(session);
        await store.hydrate();
        return {
          status: 200,
          headers: { "Content-Type": "text/plain" },
          body: store.formatOutput(selection),
        };
      });
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
