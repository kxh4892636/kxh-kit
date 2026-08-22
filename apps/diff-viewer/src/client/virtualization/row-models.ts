import type { CommentThread, DiffLine, DiffSide, LineNumber } from "../../types/diff";

type GetThreadsForLine = (lineNumber: number, side: DiffSide) => CommentThread[];

interface CommentingLine {
  side: DiffSide;
  lineNumber: LineNumber;
}

export interface UnifiedVirtualRow {
  kind: "line" | "thread" | "form";
  lineIndex: number;
  thread?: CommentThread;
}

interface UnifiedRowModelOptions {
  lines: DiffLine[];
  commentingLine: CommentingLine | null;
  getThreadsForLine: GetThreadsForLine;
}

interface UnifiedRowModel {
  rows: UnifiedVirtualRow[];
  lineRowIndexes: number[];
}

export const createUnifiedRowModel = (options: UnifiedRowModelOptions): UnifiedRowModel => {
  const { lines, commentingLine, getThreadsForLine } = options;
  const rows: UnifiedVirtualRow[] = [];
  const lineRowIndexes: number[] = [];
  const formTargetLineNumber = commentingLine
    ? Array.isArray(commentingLine.lineNumber)
      ? commentingLine.lineNumber[1]
      : commentingLine.lineNumber
    : null;

  lines.forEach((line, lineIndex): void => {
    lineRowIndexes[lineIndex] = rows.length;
    rows.push({ kind: "line", lineIndex });

    const commentLineNumber = line.type === "delete" ? line.oldLineNumber : line.newLineNumber;
    const commentSide: DiffSide = line.type === "delete" ? "old" : "new";
    if (commentLineNumber) {
      getThreadsForLine(commentLineNumber, commentSide).forEach((thread): void => {
        rows.push({ kind: "thread", lineIndex, thread });
      });
    }

    const currentLineNumber = line.newLineNumber || line.oldLineNumber || 0;
    if (
      commentingLine &&
      commentingLine.side === commentSide &&
      formTargetLineNumber === currentLineNumber
    ) {
      rows.push({ kind: "form", lineIndex });
    }
  });

  return { rows, lineRowIndexes };
};

export interface SplitLinePosition {
  oldLineNumber?: number;
  newLineNumber?: number;
  oldLineOriginalIndex?: number;
  newLineOriginalIndex?: number;
}

export interface SplitVirtualRow {
  kind: "line" | "threads" | "form";
  sideLineIndex: number;
}

interface SplitRowModelOptions<Line extends SplitLinePosition> {
  sideLines: Line[];
  commentingLine: CommentingLine | null;
  getThreadsForLine: GetThreadsForLine;
}

interface SplitRowModel {
  rows: SplitVirtualRow[];
  rowIndexByOldLineIndex: Map<number, number>;
  rowIndexByNewLineIndex: Map<number, number>;
}

const isCommentFormTarget = (
  commentingLine: CommentingLine | null,
  sideLine: SplitLinePosition,
): boolean => {
  if (!commentingLine) return false;
  const targetLineNumber = Array.isArray(commentingLine.lineNumber)
    ? commentingLine.lineNumber[1]
    : commentingLine.lineNumber;
  return commentingLine.side === "old"
    ? targetLineNumber === sideLine.oldLineNumber
    : targetLineNumber === sideLine.newLineNumber;
};

export const createSplitRowModel = <Line extends SplitLinePosition>(
  options: SplitRowModelOptions<Line>,
): SplitRowModel => {
  const { sideLines, commentingLine, getThreadsForLine } = options;
  const rows: SplitVirtualRow[] = [];
  const rowIndexByOldLineIndex = new Map<number, number>();
  const rowIndexByNewLineIndex = new Map<number, number>();

  sideLines.forEach((sideLine, sideLineIndex): void => {
    const rowIndex = rows.length;
    rows.push({ kind: "line", sideLineIndex });
    if (sideLine.oldLineOriginalIndex !== undefined && sideLine.oldLineOriginalIndex >= 0) {
      rowIndexByOldLineIndex.set(sideLine.oldLineOriginalIndex, rowIndex);
    }
    if (sideLine.newLineOriginalIndex !== undefined && sideLine.newLineOriginalIndex >= 0) {
      rowIndexByNewLineIndex.set(sideLine.newLineOriginalIndex, rowIndex);
    }

    const oldThreads = sideLine.oldLineNumber
      ? getThreadsForLine(sideLine.oldLineNumber, "old")
      : [];
    const newThreads = sideLine.newLineNumber
      ? getThreadsForLine(sideLine.newLineNumber, "new")
      : [];
    if (oldThreads.length + newThreads.length > 0) {
      rows.push({ kind: "threads", sideLineIndex });
    }
    if (isCommentFormTarget(commentingLine, sideLine)) {
      rows.push({ kind: "form", sideLineIndex });
    }
  });

  return { rows, rowIndexByOldLineIndex, rowIndexByNewLineIndex };
};
