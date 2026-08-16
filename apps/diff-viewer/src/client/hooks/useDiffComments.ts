// fork 改动 (issue 05 评论持久化, client 改动总清单见 App.tsx 文件头 #6):
// 评论 thread 不再以 localStorage 为存储 —— 事实源改为主进程 userData JSON
// (经 App.tsx 的 /api/comments 同步管道读写, 重启不丢);
// localStorage 只继续承载 viewedFiles 与 appliedCommentImportIds 等非评论数据。
import { useState, useEffect, useCallback } from "react";

import {
  type BaseMode,
  type CommentImport,
  type CommentThread,
  type DiffContextStorage,
  type DiffCommentThread,
  type DiffSide,
  type LegacyDiffComment,
} from "../../types/diff";
import {
  type CommentPromptDiffContext,
  formatCommentThreadPrompt,
  formatAllCommentThreadsPrompt,
} from "../../utils/commentFormatting";
import { createId } from "../../utils/createId";
import { mergeCommentImports } from "../../utils/commentImports";
import { storageService } from "../services/StorageService";
import { getLanguageFromPath } from "../utils/diffUtils";

interface AddThreadParams {
  filePath: string;
  body: string;
  side: DiffSide;
  line: number | { start: number; end: number };
  codeSnapshot?: DiffCommentThread["codeSnapshot"];
}

interface ReplyToThreadParams {
  threadId: string;
  body: string;
}

interface UseDiffCommentsReturn {
  hasLoadedComments: boolean;
  comments: LegacyDiffComment[];
  threads: DiffCommentThread[];
  replaceThreads: (threads: DiffCommentThread[]) => void;
  addComment: (params: AddThreadParams) => LegacyDiffComment;
  addThread: (params: AddThreadParams) => DiffCommentThread;
  removeComment: (commentId: string) => void;
  replyToThread: (params: ReplyToThreadParams) => void;
  removeThread: (threadId: string) => void;
  updateComment: (commentId: string, newBody: string) => void;
  removeMessage: (threadId: string, messageId: string) => void;
  updateMessage: (threadId: string, messageId: string, newBody: string) => void;
  clearAllComments: (options?: { resetAppliedCommentImportIds?: boolean }) => void;
  applyCommentImports: (imports: CommentImport[], importId: string) => string[];
  generatePrompt: (commentId: string) => string;
  generateThreadPrompt: (threadId: string) => string;
  generateAllCommentsPrompt: (context?: CommentPromptDiffContext) => string;
}

function normalizeThread(thread: DiffCommentThread): CommentThread {
  return {
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
  };
}

function normalizeRootComment(thread: DiffCommentThread): LegacyDiffComment | null {
  const rootMessage = thread.messages[0];
  if (!rootMessage) return null;

  return {
    id: thread.id,
    filePath: thread.filePath,
    body: rootMessage.body,
    author: rootMessage.author,
    createdAt: rootMessage.createdAt,
    updatedAt: rootMessage.updatedAt,
    position: thread.position,
    codeSnapshot: thread.codeSnapshot,
  };
}

export function useDiffComments(
  baseCommitish?: string,
  targetCommitish?: string,
  currentCommitHash?: string,
  branchToHash?: Map<string, string>,
  repositoryId?: string,
  baseMode?: BaseMode,
): UseDiffCommentsReturn {
  const [threads, setThreads] = useState<DiffCommentThread[]>([]);
  const [hasLoadedComments, setHasLoadedComments] = useState(false);

  const loadDiffContextData = useCallback(() => {
    if (!baseCommitish || !targetCommitish) {
      return null;
    }

    return storageService.getDiffContextData(
      baseCommitish,
      targetCommitish,
      currentCommitHash,
      branchToHash,
      repositoryId,
      baseMode,
    );
  }, [baseCommitish, targetCommitish, currentCommitHash, branchToHash, repositoryId, baseMode]);

  const createEmptyDiffContext = useCallback((): DiffContextStorage | null => {
    if (!baseCommitish || !targetCommitish) {
      return null;
    }

    const now = new Date().toISOString();
    return {
      version: 2,
      baseCommitish,
      targetCommitish,
      baseMode,
      createdAt: now,
      lastModifiedAt: now,
      threads: [],
      viewedFiles: [],
      appliedCommentImportIds: [],
    };
  }, [baseCommitish, targetCommitish, baseMode]);

  useEffect(() => {
    // issue 05: thread 不从 localStorage 恢复; 初始为空, 由 App 的 bootstrap
    // 从主进程持久化会话拉取 (fetchServerThreads → replaceThreads)。
    // 依赖项与改造前一致: 任一上下文键变化都先清空, 避免跨仓库/对比串评论
    setThreads([]);
    setHasLoadedComments(Boolean(baseCommitish && targetCommitish));
  }, [baseCommitish, targetCommitish, currentCommitHash, branchToHash, repositoryId, baseMode]);

  const saveThreads = useCallback(
    (newThreads: DiffCommentThread[]) => {
      if (!baseCommitish || !targetCommitish) return;

      // issue 05: 不再写 localStorage; 持久化由 App 同步到主进程 userData JSON
      setThreads(newThreads);
      setHasLoadedComments(true);
    },
    [baseCommitish, targetCommitish],
  );

  const replaceThreads = useCallback(
    (newThreads: DiffCommentThread[]) => {
      saveThreads(newThreads);
    },
    [saveThreads],
  );

  const addThread = useCallback(
    (params: AddThreadParams): DiffCommentThread => {
      const now = new Date().toISOString();
      const threadId = createId();
      const newThread: DiffCommentThread = {
        id: threadId,
        filePath: params.filePath,
        createdAt: now,
        updatedAt: now,
        position: {
          side: params.side,
          line: params.line,
        },
        codeSnapshot: params.codeSnapshot || {
          content: "",
          language: getLanguageFromPath(params.filePath),
        },
        messages: [
          {
            id: threadId,
            body: params.body,
            author: "User",
            createdAt: now,
            updatedAt: now,
          },
        ],
      };

      const newThreads = [...threads, newThread];
      saveThreads(newThreads);
      return newThread;
    },
    [saveThreads, threads],
  );

  const addComment = useCallback(
    (params: AddThreadParams): LegacyDiffComment => {
      const thread = addThread(params);
      const rootComment = normalizeRootComment(thread);
      if (!rootComment) {
        throw new Error("Failed to create root comment");
      }
      return rootComment;
    },
    [addThread],
  );

  const replyToThread = useCallback(
    ({ threadId, body }: ReplyToThreadParams) => {
      const now = new Date().toISOString();
      const newThreads = threads.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              updatedAt: now,
              messages: [
                ...thread.messages,
                {
                  id: createId(),
                  body,
                  author: "User",
                  createdAt: now,
                  updatedAt: now,
                },
              ],
            }
          : thread,
      );
      saveThreads(newThreads);
    },
    [saveThreads, threads],
  );

  const removeThread = useCallback(
    (threadId: string) => {
      const newThreads = threads.filter((thread) => thread.id !== threadId);
      saveThreads(newThreads);
    },
    [saveThreads, threads],
  );

  const removeComment = useCallback(
    (commentId: string) => {
      removeThread(commentId);
    },
    [removeThread],
  );

  const removeMessage = useCallback(
    (threadId: string, messageId: string) => {
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) return;

      const targetIndex = thread.messages.findIndex((message) => message.id === messageId);
      if (targetIndex < 0) {
        return;
      }

      if (targetIndex === 0) {
        removeThread(threadId);
        return;
      }

      const now = new Date().toISOString();
      const newThreads = threads.map((item) =>
        item.id === threadId
          ? {
              ...item,
              updatedAt: now,
              messages: item.messages.filter((message) => message.id !== messageId),
            }
          : item,
      );
      saveThreads(newThreads);
    },
    [removeThread, saveThreads, threads],
  );

  const updateMessage = useCallback(
    (threadId: string, messageId: string, newBody: string) => {
      const now = new Date().toISOString();
      const newThreads = threads.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              updatedAt: now,
              messages: thread.messages.map((message) =>
                message.id === messageId ? { ...message, body: newBody, updatedAt: now } : message,
              ),
            }
          : thread,
      );
      saveThreads(newThreads);
    },
    [saveThreads, threads],
  );

  const updateComment = useCallback(
    (commentId: string, newBody: string) => {
      updateMessage(commentId, commentId, newBody);
    },
    [updateMessage],
  );

  const clearAllComments = useCallback(() => {
    saveThreads([]);
  }, [saveThreads]);

  const clearAllCommentsWithOptions = useCallback(
    (options?: { resetAppliedCommentImportIds?: boolean }) => {
      if (!options?.resetAppliedCommentImportIds) {
        clearAllComments();
        return;
      }

      const existingData = loadDiffContextData() || createEmptyDiffContext();
      if (!existingData || !baseCommitish || !targetCommitish) {
        return;
      }

      const nextData: DiffContextStorage = {
        ...existingData,
        threads: [],
        appliedCommentImportIds: [],
      };

      storageService.saveDiffContextData(
        baseCommitish,
        targetCommitish,
        nextData,
        currentCommitHash,
        branchToHash,
        repositoryId,
        baseMode,
      );
      setThreads([]);
    },
    [
      baseCommitish,
      targetCommitish,
      branchToHash,
      clearAllComments,
      createEmptyDiffContext,
      currentCommitHash,
      loadDiffContextData,
      repositoryId,
      baseMode,
    ],
  );

  const applyCommentImports = useCallback(
    (imports: CommentImport[], importId: string): string[] => {
      if (!baseCommitish || !targetCommitish || imports.length === 0 || importId.length === 0) {
        return [];
      }

      const existingData = loadDiffContextData() || createEmptyDiffContext();
      if (!existingData) {
        return [];
      }

      if (existingData.appliedCommentImportIds.includes(importId)) {
        return [];
      }

      // issue 05: thread 事实源是内存态 (经 App 同步主进程); localStorage 记录里
      // 的 threads 字段不再回读, 仅 appliedCommentImportIds 仍在那里跟踪
      const merged = mergeCommentImports(threads, imports);
      const nextData: DiffContextStorage = {
        ...existingData,
        threads: merged.threads,
        appliedCommentImportIds: [...existingData.appliedCommentImportIds, importId],
      };

      storageService.saveDiffContextData(
        baseCommitish,
        targetCommitish,
        nextData,
        currentCommitHash,
        branchToHash,
        repositoryId,
        baseMode,
      );
      setThreads(merged.threads);
      return merged.warnings;
    },
    [
      baseCommitish,
      targetCommitish,
      branchToHash,
      createEmptyDiffContext,
      currentCommitHash,
      loadDiffContextData,
      repositoryId,
      baseMode,
      threads,
    ],
  );

  const generateThreadPrompt = useCallback(
    (threadId: string): string => {
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) return "";

      return formatCommentThreadPrompt(normalizeThread(thread));
    },
    [threads],
  );

  const generatePrompt = useCallback(
    (commentId: string): string => {
      return generateThreadPrompt(commentId);
    },
    [generateThreadPrompt],
  );

  const generateAllCommentsPrompt = useCallback(
    (context?: CommentPromptDiffContext): string => {
      return formatAllCommentThreadsPrompt(threads.map(normalizeThread), context);
    },
    [threads],
  );

  const comments = threads
    .map((thread) => normalizeRootComment(thread))
    .filter((comment): comment is LegacyDiffComment => comment !== null);

  return {
    hasLoadedComments,
    comments,
    threads,
    replaceThreads,
    addComment,
    addThread,
    removeComment,
    replyToThread,
    removeThread,
    updateComment,
    removeMessage,
    updateMessage,
    clearAllComments: clearAllCommentsWithOptions,
    applyCommentImports,
    generatePrompt,
    generateThreadPrompt,
    generateAllCommentsPrompt,
  };
}
