import { diffWords, diffWordsWithSpace } from "diff";

import { type DiffLine } from "../../../types/diff";

export interface DiffSegment {
  value: string;
  type: "unchanged" | "added" | "removed";
}

export interface WordLevelDiffResult {
  oldSegments: DiffSegment[];
  newSegments: DiffSegment[];
}

/**
 * Compute word-level diff between two strings.
 * Returns segments for both old and new lines, each marked as unchanged, added, or removed.
 */
export function computeWordLevelDiff(oldContent: string, newContent: string): WordLevelDiffResult {
  const changes = diffWordsWithSpace(oldContent, newContent);

  const oldSegments: DiffSegment[] = [];
  const newSegments: DiffSegment[] = [];

  for (const change of changes) {
    if (change.added) {
      // Added segment only appears in new
      newSegments.push({ value: change.value, type: "added" });
    } else if (change.removed) {
      // Removed segment only appears in old
      oldSegments.push({ value: change.value, type: "removed" });
    } else {
      // Unchanged segment appears in both
      oldSegments.push({ value: change.value, type: "unchanged" });
      newSegments.push({ value: change.value, type: "unchanged" });
    }
  }

  return { oldSegments, newSegments };
}

/**
 * Check if two lines are similar enough to warrant word-level diff.
 * Returns true if the lines share some common content.
 */
export function shouldComputeWordDiff(oldContent: string, newContent: string): boolean {
  // Skip if either line is empty or too short
  if (!oldContent.trim() || !newContent.trim()) {
    return false;
  }

  // Skip if lines are identical
  if (oldContent === newContent) {
    return false;
  }

  // Compute similarity ratio using Levenshtein-like approach
  // If lines are too different, skip word-level diff
  const changes = diffWords(oldContent, newContent);

  let unchangedLength = 0;
  let totalLength = 0;

  for (const change of changes) {
    totalLength += change.value.length;
    if (!change.added && !change.removed) {
      unchangedLength += change.value.length;
    }
  }

  // Require at least 20% similarity to show word-level diff
  const similarityRatio = unchangedLength / totalLength;
  return similarityRatio >= 0.2;
}

export interface ModifiedLinePair {
  oldContent: string;
  newContent: string;
  side: "old" | "new";
}

/** 只扫描并配对相邻的删除/新增行；昂贵的词级差异留到对应行实际挂载时计算。 */
export const findModifiedLinePairs = (lines: DiffLine[]): Map<number, ModifiedLinePair> => {
  const pairs = new Map<number, ModifiedLinePair>();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.type !== "delete") {
      i++;
      continue;
    }

    let j = i + 1;
    while (j < lines.length && lines[j]?.type === "delete") {
      j++;
    }
    const deleteStartIndex = i;
    const deleteCount = j - i;
    const addStartIndex = j;
    while (j < lines.length && lines[j]?.type === "add") {
      j++;
    }
    const addCount = j - addStartIndex;

    const pairCount = Math.min(deleteCount, addCount);
    for (let k = 0; k < pairCount; k++) {
      const oldContent = lines[deleteStartIndex + k]?.content ?? "";
      const newContent = lines[addStartIndex + k]?.content ?? "";
      pairs.set(deleteStartIndex + k, { oldContent, newContent, side: "old" });
      pairs.set(addStartIndex + k, { oldContent, newContent, side: "new" });
    }

    i = j;
  }

  return pairs;
};

/** 虚拟列表只为实际挂载的行计算并缓存词级差异。 */
export const createWordDiffResolver = (
  lines: DiffLine[],
): ((lineIndex: number) => DiffSegment[] | undefined) => {
  const pairs = findModifiedLinePairs(lines);
  const cache = new Map<number, DiffSegment[] | undefined>();

  return (lineIndex) => {
    if (cache.has(lineIndex)) {
      return cache.get(lineIndex);
    }

    const pair = pairs.get(lineIndex);
    let segments: DiffSegment[] | undefined;
    if (pair && shouldComputeWordDiff(pair.oldContent, pair.newContent)) {
      const result = computeWordLevelDiff(pair.oldContent, pair.newContent);
      segments = pair.side === "old" ? result.oldSegments : result.newSegments;
    }

    cache.set(lineIndex, segments);
    return segments;
  };
};
