import { useCallback, useMemo } from "react";

import type { CommentThread, DiffSide } from "../../types/diff";

type GetThreadsForLine = (lineNumber: number, side: DiffSide) => CommentThread[];

const appendThread = <Key>(
  index: Map<Key, CommentThread[]>,
  key: Key,
  thread: CommentThread,
): void => {
  const matches = index.get(key);
  if (matches) {
    matches.push(thread);
  } else {
    index.set(key, [thread]);
  }
};

/** 为 diff 行建立评论索引，避免大 chunk 渲染时反复扫描全部评论。 */
export const useLineThreads = (threads: CommentThread[]): GetThreadsForLine => {
  const threadsByLine = useMemo(() => {
    const indexed = new Map<string, CommentThread[]>();
    const sideless = new Map<number, CommentThread[]>();

    threads.forEach((thread) => {
      const lineEnd = Array.isArray(thread.line) ? thread.line[1] : thread.line;
      if (thread.side) {
        appendThread(indexed, `${thread.side}:${lineEnd}`, thread);
      } else {
        appendThread(sideless, lineEnd, thread);
      }
    });

    return { indexed, sideless };
  }, [threads]);

  return useCallback(
    (lineNumber: number, side: DiffSide): CommentThread[] => {
      const matched = [
        ...(threadsByLine.indexed.get(`${side}:${lineNumber}`) ?? []),
        ...(threadsByLine.sideless.get(lineNumber) ?? []),
      ];
      return matched.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    [threadsByLine],
  );
};
