// 移植自 difit 上游 src/server/server.ts 的评论会话逻辑: 评论 thread 存储,
// 按对比 (DiffSelection key) 隔离会话。issue 05 起会话经 comment-persistence.ts
// 落盘到 userData JSON (按 仓库+对比 为键), 内存态只是运行期缓存;
// 不注入 persister 时保持纯内存 (单测与无盘场景)。
import { createHash } from "crypto";

import {
  type Comment,
  type CommentThread,
  type DiffCommentThread,
  type DiffSelection,
} from "../types/diff.js";
import { formatCommentsOutput } from "../utils/commentFormatting.js";
import { mergeCommentThreads } from "../utils/commentImports.js";
import { getDiffSelectionKey } from "../utils/diffSelection.js";

import { type CommentPersister, type CommentSessionSnapshot } from "./comment-persistence.js";

export type { CommentSessionSnapshot } from "./comment-persistence.js";

export interface CommentSessionState {
  threads: DiffCommentThread[];
  version: number;
}

export interface CommentSessionStore {
  // 首次读写前恢复落盘会话; 幂等 (只 load 一次), 不覆盖内存已有会话
  hydrate: () => Promise<void>;
  getSession: (selection: DiffSelection) => CommentSessionState;
  // baseVersion 陈旧时说明有并发写入, 走 merge 而非覆盖;
  // persisted 在本次变更落盘 (或确认无需落盘) 后解析
  replaceThreads: (
    selection: DiffSelection,
    nextThreads: DiffCommentThread[],
    baseVersion?: number,
  ) => { merged: boolean; version: number; threads: DiffCommentThread[]; persisted: Promise<void> };
  deleteThread: (
    selection: DiffSelection,
    threadId: string,
  ) => { found: boolean; version: number; persisted: Promise<void> };
  formatOutput: (selection: DiffSelection) => string;
}

const normalizeLineValue = (line: unknown): DiffCommentThread["position"]["line"] => {
  if (Array.isArray(line) && line.length === 2) {
    const start = line[0] as unknown;
    const end = line[1] as unknown;
    if (
      typeof start === "number" &&
      typeof end === "number" &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start > 0 &&
      end > 0 &&
      start <= end
    ) {
      return { start, end };
    }
  }

  if (typeof line === "number" && Number.isInteger(line) && line > 0) {
    return line;
  }

  return 1;
};

const normalizeComment = (comment: Comment): DiffCommentThread => {
  const now = new Date().toISOString();
  const timestamp = typeof comment.timestamp === "string" ? comment.timestamp : now;
  const threadId =
    typeof comment.id === "string" && comment.id.length > 0
      ? comment.id
      : createHash("sha256").update(JSON.stringify(comment)).digest("hex").slice(0, 12);
  const filePath =
    typeof comment.file === "string" && comment.file.length > 0 ? comment.file : "<unknown file>";

  return {
    id: threadId,
    filePath,
    createdAt: timestamp,
    updatedAt: timestamp,
    position: {
      side: comment.side ?? "new",
      line: normalizeLineValue(comment.line),
    },
    codeSnapshot:
      typeof comment.codeContent === "string"
        ? {
            content: comment.codeContent,
          }
        : undefined,
    messages: [
      {
        id: threadId,
        body: comment.body,
        author: comment.author,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
};

const toCommentThread = (thread: DiffCommentThread): CommentThread => ({
  id: thread.id,
  file: thread.filePath,
  line:
    typeof thread.position.line === "number"
      ? thread.position.line
      : ([thread.position.line.start, thread.position.line.end] as [number, number]),
  side: thread.position.side,
  createdAt: thread.createdAt,
  updatedAt: thread.updatedAt,
  codeContent: thread.codeSnapshot?.content,
  messages: thread.messages,
});

const normalizeThreadPayload = (thread: CommentThread | DiffCommentThread): DiffCommentThread => {
  if ("filePath" in thread && "position" in thread) {
    return thread;
  }

  const threadId =
    typeof thread.id === "string" && thread.id.length > 0
      ? thread.id
      : createHash("sha256").update(JSON.stringify(thread)).digest("hex").slice(0, 12);
  const now = new Date().toISOString();
  const messages =
    Array.isArray(thread.messages) && thread.messages.length > 0
      ? thread.messages.map((message, index) => ({
          id:
            typeof message.id === "string" && message.id.length > 0
              ? message.id
              : `${threadId}:${index}`,
          body: message.body,
          author: message.author,
          createdAt: message.createdAt || thread.createdAt || now,
          updatedAt: message.updatedAt || message.createdAt || thread.updatedAt || now,
        }))
      : [
          {
            id: threadId,
            body: "",
            createdAt: thread.createdAt || now,
            updatedAt: thread.updatedAt || thread.createdAt || now,
          },
        ];
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];

  return {
    id: threadId,
    filePath:
      typeof thread.file === "string" && thread.file.length > 0 ? thread.file : "<unknown file>",
    createdAt: thread.createdAt || firstMessage?.createdAt || now,
    updatedAt: thread.updatedAt || lastMessage?.updatedAt || thread.createdAt || now,
    position: {
      side: thread.side ?? "new",
      line: normalizeLineValue(thread.line),
    },
    codeSnapshot:
      typeof thread.codeContent === "string"
        ? {
            content: thread.codeContent,
          }
        : undefined,
    messages,
  };
};

const parseCommentsPayload = (body: unknown): DiffCommentThread[] => {
  const payload =
    typeof body === "string"
      ? (JSON.parse(body) as {
          comments?: Comment[];
          threads?: Array<CommentThread | DiffCommentThread>;
        })
      : (body as {
          comments?: Comment[];
          threads?: Array<CommentThread | DiffCommentThread>;
        });

  if (Array.isArray(payload.threads)) {
    return payload.threads.map(normalizeThreadPayload);
  }

  if (Array.isArray(payload.comments)) {
    return payload.comments.map(normalizeComment);
  }

  return [];
};

// 客户端推送时基于的版本号 (旧客户端可省略)
const parseBaseVersion = (payload: unknown): number | undefined => {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as { baseVersion?: unknown }).baseVersion;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
};

// 请求体 JSON 解析的唯一实现, api-router 复用; 空 body 按空对象处理
export const parseBodyObject = (body: string | undefined): unknown => {
  if (body === undefined || body === "") {
    return {};
  }
  return JSON.parse(body) as unknown;
};

export const createCommentSessionStore = (
  onChanged?: (selection: DiffSelection, version: number) => void,
  persister?: CommentPersister,
): CommentSessionStore => {
  const sessions = new Map<string, CommentSessionState>();
  let hydratePromise: Promise<void> | null = null;

  const hydrate = (): Promise<void> => {
    if (!persister) {
      return Promise.resolve();
    }
    hydratePromise ??= persister
      .load()
      .then((loaded) => {
        for (const [key, snapshot] of Object.entries(loaded)) {
          if (!sessions.has(key)) {
            sessions.set(key, { threads: snapshot.threads, version: snapshot.version });
          }
        }
      })
      .catch((error: unknown) => {
        // load 内部已按缺失/损坏分类记日志, 这里兜底未知异常, 保证路由永远可用
        console.error("Failed to hydrate persisted comments:", error);
      });
    return hydratePromise;
  };

  // 每次变更整仓库快照落盘 (单文件全量写, 由 persister 队列串行化)
  const persistSessions = (): Promise<void> => {
    if (!persister) {
      return Promise.resolve();
    }
    const updatedAt = new Date().toISOString();
    const snapshot: Record<string, CommentSessionSnapshot> = {};
    for (const [key, session] of sessions) {
      snapshot[key] = { version: session.version, updatedAt, threads: session.threads };
    }
    return persister.save(snapshot);
  };

  const getOrCreateSession = (selection: DiffSelection): CommentSessionState => {
    const key = getDiffSelectionKey(selection);
    const existing = sessions.get(key);
    if (existing) {
      return existing;
    }

    const nextSession: CommentSessionState = { threads: [], version: 0 };
    sessions.set(key, nextSession);
    return nextSession;
  };

  const updateSession = (
    selection: DiffSelection,
    nextThreads: DiffCommentThread[],
  ): { changed: boolean; session: CommentSessionState; persisted: Promise<void> } => {
    const session = getOrCreateSession(selection);
    const previous = JSON.stringify(session.threads);
    const next = JSON.stringify(nextThreads);
    session.threads = nextThreads;

    if (previous === next) {
      return { changed: false, session, persisted: Promise.resolve() };
    }

    session.version += 1;
    onChanged?.(selection, session.version);
    return { changed: true, session, persisted: persistSessions() };
  };

  return {
    hydrate,
    getSession: (selection) => getOrCreateSession(selection),

    replaceThreads: (selection, nextThreads, baseVersion) => {
      const session = getOrCreateSession(selection);

      const isStale = typeof baseVersion === "number" && baseVersion !== session.version;
      const resolvedThreads = isStale
        ? mergeCommentThreads(session.threads, nextThreads).threads
        : nextThreads;

      const { session: updated, persisted } = updateSession(selection, resolvedThreads);
      return { merged: isStale, version: updated.version, threads: updated.threads, persisted };
    },

    deleteThread: (selection, threadId) => {
      const session = getOrCreateSession(selection);
      const nextThreads = session.threads.filter((thread) => thread.id !== threadId);

      if (nextThreads.length === session.threads.length) {
        return { found: false, version: session.version, persisted: Promise.resolve() };
      }

      const { session: updated, persisted } = updateSession(selection, nextThreads);
      return { found: true, version: updated.version, persisted };
    },

    formatOutput: (selection) => {
      const session = getOrCreateSession(selection);
      if (session.threads.length === 0) {
        return "";
      }
      return formatCommentsOutput(session.threads.map(toCommentThread));
    },
  };
};

// 供 router 复用的请求体解析: POST /api/comments 的 body 同时携带 threads 与 baseVersion
export const parseCommentPushBody = (
  body: string | undefined,
): { threads: DiffCommentThread[]; baseVersion?: number } => {
  const parsed = parseBodyObject(body);
  return {
    threads: parseCommentsPayload(parsed),
    baseVersion: parseBaseVersion(parsed),
  };
};
