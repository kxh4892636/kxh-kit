import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";

import { type VirtualItem } from "@tanstack/react-virtual";

import {
  type DiffChunk as DiffChunkType,
  type DiffLine,
  type DiffSide,
  type CommentThread,
  type LineNumber,
  type DiffViewMode,
  type LineSelection,
} from "../../types/diff";
import { DEFAULT_DIFF_VIEW_MODE } from "../../utils/diffMode";
import {
  ESTIMATED_CODE_ROW_HEIGHT,
  ESTIMATED_COMMENT_FORM_HEIGHT,
  ESTIMATED_COMMENT_ROW_HEIGHT,
} from "../constants/virtualization";
import { type CursorPosition } from "../hooks/keyboardNavigation";
import { useLineThreads } from "../hooks/diff-chunk/use-line-threads";
import { useChunkVirtualizer } from "../hooks/useChunkVirtualizer";
import { createWordDiffResolver } from "../utils/wordLevelDiff";

import { CommentForm } from "./CommentForm";
import { CommentThreadCard } from "./CommentThreadCard";
import { DiffLineRow } from "./DiffLineRow";
import type { AppearanceSettings } from "./SettingsModal";
import { SideBySideDiffChunk } from "./SideBySideDiffChunk";

interface DiffChunkProps {
  chunk: DiffChunkType;
  chunkIndex: number;
  threads: CommentThread[];
  showAuthorBadges?: boolean;
  onAddComment: (
    line: LineNumber,
    body: string,
    codeContent?: string,
    side?: DiffSide,
  ) => Promise<void>;
  onGenerateThreadPrompt: (thread: CommentThread) => string;
  onRemoveThread: (threadId: string) => void;
  onReplyToThread: (threadId: string, body: string) => Promise<void>;
  onRemoveMessage: (threadId: string, messageId: string) => void;
  onUpdateMessage: (threadId: string, messageId: string, newBody: string) => void;
  mode?: DiffViewMode;
  syntaxTheme?: AppearanceSettings["syntaxTheme"];
  cursor?: CursorPosition | null;
  fileIndex?: number;
  onLineClick?: (
    fileIndex: number,
    chunkIndex: number,
    lineIndex: number,
    side: "left" | "right",
  ) => void;
  commentTrigger?: {
    fileIndex: number;
    chunkIndex: number;
    lineIndex: number;
  } | null;
  onCommentTriggerHandled?: () => void;
  filename?: string;
  onOpenInEditor?: (filePath: string, lineNumber: number) => void;
}

export const DiffChunk = memo(function DiffChunk({
  chunk,
  chunkIndex,
  threads,
  showAuthorBadges = false,
  onAddComment,
  onGenerateThreadPrompt,
  onRemoveThread,
  onReplyToThread,
  onRemoveMessage,
  onUpdateMessage,
  mode = DEFAULT_DIFF_VIEW_MODE,
  syntaxTheme,
  cursor = null,
  fileIndex = 0,
  onLineClick,
  commentTrigger,
  onCommentTriggerHandled,
  filename,
  onOpenInEditor,
}: DiffChunkProps) {
  const [startLine, setStartLine] = useState<number | null>(null);
  const [endLine, setEndLine] = useState<number | null>(null);
  const [dragSide, setDragSide] = useState<DiffSide | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [commentingLine, setCommentingLine] = useState<{
    side: DiffSide;
    lineNumber: LineNumber;
  } | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<{
    side: DiffSide;
    lineNumber: number;
  } | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  // Handle comment trigger from keyboard navigation
  useEffect(() => {
    if (commentTrigger?.lineIndex !== undefined) {
      const line = chunk.lines[commentTrigger.lineIndex];
      if (line) {
        const lineNumber = line.newLineNumber || line.oldLineNumber;
        const side: DiffSide = line.type === "delete" ? "old" : "new";
        if (lineNumber) {
          setCommentingLine({ side, lineNumber });
          onCommentTriggerHandled?.();
        }
      }
    }
  }, [commentTrigger, chunk.lines, onCommentTriggerHandled]);

  const handleAddComment = useCallback(
    (side: DiffSide, lineNumber: LineNumber) => {
      if (commentingLine?.side === side && commentingLine?.lineNumber === lineNumber) {
        setCommentingLine(null);
      } else {
        setCommentingLine({ side, lineNumber });
      }
    },
    [commentingLine],
  );

  const getCommentLineFromAnchor = (selection: LineSelection): LineNumber => {
    if (!selectionAnchor || selectionAnchor.side !== selection.side) {
      return selection.lineNumber;
    }

    const min = Math.min(selectionAnchor.lineNumber, selection.lineNumber);
    const max = Math.max(selectionAnchor.lineNumber, selection.lineNumber);
    return min === max ? selection.lineNumber : [min, max];
  };

  const openShiftClickComment = (selection: LineSelection) => {
    handleAddComment(selection.side, getCommentLineFromAnchor(selection));
    setSelectionAnchor(selection);
  };

  const startCommentDrag = (selection: LineSelection) => {
    setSelectionAnchor(selection);
    setStartLine(selection.lineNumber);
    setEndLine(selection.lineNumber);
    setDragSide(selection.side);
    setIsDragging(true);
  };

  const handleCommentButtonMouseDown = ({
    isShiftClick,
    selection,
  }: {
    isShiftClick: boolean;
    selection: LineSelection | null;
  }) => {
    if (!selection) return;

    if (isShiftClick) {
      openShiftClickComment(selection);
      return;
    }

    startCommentDrag(selection);
  };

  const handleRowClick = ({
    isShiftClick,
    lineIndex,
    navigationSide,
    selection,
  }: {
    isShiftClick: boolean;
    lineIndex: number;
    navigationSide: "left" | "right";
    selection: LineSelection | null;
  }) => {
    if (!selection) {
      onLineClick?.(fileIndex, chunkIndex, lineIndex, navigationSide);
      return;
    }

    if (isShiftClick) {
      openShiftClickComment(selection);
      return;
    }

    setSelectionAnchor(selection);
    onLineClick?.(fileIndex, chunkIndex, lineIndex, navigationSide);
  };

  // Global mouse up handler for drag selection: commit the selection wherever
  // the mouse is released, not only on the comment button itself
  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }

    const handleGlobalMouseUp = () => {
      // Defer so the click event fired after mouseup doesn't immediately
      // close the newly opened (still empty) comment form
      setTimeout(() => {
        if (startLine && dragSide) {
          const actualEndLine = endLine ?? startLine;
          if (startLine === actualEndLine) {
            handleAddComment(dragSide, startLine);
          } else {
            const min = Math.min(startLine, actualEndLine);
            const max = Math.max(startLine, actualEndLine);
            handleAddComment(dragSide, [min, max]);
          }
        }
        setIsDragging(false);
        setStartLine(null);
        setEndLine(null);
        setDragSide(null);
      }, 0);
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isDragging, startLine, endLine, dragSide, handleAddComment]);

  const handleCancelComment = useCallback(() => {
    setCommentingLine(null);
  }, []);

  // Get the code content for the selected lines (for suggestion feature)
  const getSelectedCodeContent = useCallback((): string => {
    if (!commentingLine) return "";

    const { side, lineNumber } = commentingLine;
    const lines = chunk.lines;

    if (typeof lineNumber === "number") {
      // Single line
      const line = lines.find((l) =>
        side === "old" ? l.oldLineNumber === lineNumber : l.newLineNumber === lineNumber,
      );
      return line?.content ?? "";
    } else {
      // Range of lines
      const [start, end] = lineNumber;
      const selectedLines = lines.filter((l) => {
        const ln = side === "old" ? l.oldLineNumber : l.newLineNumber;
        return ln !== undefined && ln >= start && ln <= end;
      });
      return selectedLines.map((l) => l.content ?? "").join("\n");
    }
  }, [commentingLine, chunk.lines]);

  const handleSubmitComment = useCallback(
    async (body: string) => {
      if (commentingLine !== null) {
        const codeContent = getSelectedCodeContent();
        await onAddComment(commentingLine.lineNumber, body, codeContent, commentingLine.side);
        setCommentingLine(null);
      }
    },
    [commentingLine, onAddComment, getSelectedCodeContent],
  );

  const getThreadsForLine = useLineThreads(threads);

  const getCommentLayout = (line: DiffLine): "left" | "right" | "full" => {
    // In unified mode, always use full width for comments
    if (mode === "unified") {
      return "full";
    }

    switch (line.type) {
      case "delete":
        return "left";
      case "add":
        return "right";
      default:
        return "full";
    }
  };

  const getSelectedLineStyle = (lineNumber: number | undefined, side: DiffSide): string => {
    if (!lineNumber) {
      return "";
    }

    // Show selection during drag
    if (isDragging && startLine && endLine) {
      const min = Math.min(startLine, endLine);
      const max = Math.max(startLine, endLine);
      if (lineNumber >= min && lineNumber <= max) {
        let classes = "drag-selected";
        // Add top border for first line
        if (lineNumber === min) {
          classes += " drag-selected-first";
        }
        // Add bottom border for last line
        if (lineNumber === max) {
          classes += " drag-selected-last";
        }
        return classes;
      }
    }

    // Show selection for existing comment
    if (commentingLine && commentingLine.side === side) {
      const start = Array.isArray(commentingLine.lineNumber)
        ? commentingLine.lineNumber[0]
        : commentingLine.lineNumber;
      const end = Array.isArray(commentingLine.lineNumber)
        ? commentingLine.lineNumber[1]
        : commentingLine.lineNumber;
      if (lineNumber >= start && lineNumber <= end) {
        return "comment-selected";
      }
    }

    return "";
  };

  // word-level diff 惰性解析: 配对扫描是廉价的 O(n), 逐词 diff 只在实际挂载的
  // 行上发生, 大 chunk 不再为视口外的行付 CPU (渲染结果与原全量预计算一致)
  const wordDiffResolver = useMemo(() => createWordDiffResolver(chunk.lines), [chunk.lines]);

  // 压平行模型: 代码行 + 锚定其后的评论卡片行/评论表单行。行数低于阈值时逐行
  // 渲染与原实现等价; 超过阈值时作为虚拟列表的行源
  const { flatRows, lineRowIndexes } = useMemo(() => {
    interface UnifiedRow {
      kind: "line" | "thread" | "form";
      lineIndex: number;
      thread?: CommentThread;
    }
    const rows: UnifiedRow[] = [];
    const indexes: number[] = [];
    const formTargetLineNumber = commentingLine
      ? Array.isArray(commentingLine.lineNumber)
        ? commentingLine.lineNumber[1]
        : commentingLine.lineNumber
      : null;

    chunk.lines.forEach((line, index) => {
      indexes[index] = rows.length;
      rows.push({ kind: "line", lineIndex: index });

      // Delete lines: use oldLineNumber and 'old' side
      // Add/normal lines: use newLineNumber and 'new' side
      const commentLineNumber = line.type === "delete" ? line.oldLineNumber : line.newLineNumber;
      const commentSide: DiffSide = line.type === "delete" ? "old" : "new";
      if (commentLineNumber) {
        getThreadsForLine(commentLineNumber, commentSide).forEach((thread) => {
          rows.push({ kind: "thread", lineIndex: index, thread });
        });
      }

      const currentLineNumber = line.newLineNumber || line.oldLineNumber || 0;
      if (
        commentingLine &&
        commentingLine.side === commentSide &&
        formTargetLineNumber === currentLineNumber
      ) {
        rows.push({ kind: "form", lineIndex: index });
      }
    });

    return { flatRows: rows, lineRowIndexes: indexes };
  }, [chunk.lines, getThreadsForLine, commentingLine]);

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const estimateRowSize = useCallback(
    (rowIndex: number) => {
      const row = flatRows[rowIndex];
      if (!row || row.kind === "line") return ESTIMATED_CODE_ROW_HEIGHT;
      return row.kind === "thread" ? ESTIMATED_COMMENT_ROW_HEIGHT : ESTIMATED_COMMENT_FORM_HEIGHT;
    },
    [flatRows],
  );
  const { virtualized, virtualItems, paddingTop, paddingBottom, measureRow, scrollToRow } =
    useChunkVirtualizer({
      rowCount: flatRows.length,
      estimateRowSize,
      anchorRef,
    });

  // cursor/评论跳转到未挂载行时, 先让虚拟器把目标行滚动进视口;
  // 已挂载时 align:"auto" 不会额外滚动, 既有 DOM 滚动逻辑照常接管
  useEffect(() => {
    if (!virtualized || !cursor || cursor.chunkIndex !== chunkIndex) return;
    const rowIndex = lineRowIndexes[cursor.lineIndex];
    if (rowIndex !== undefined) {
      scrollToRow(rowIndex);
    }
  }, [virtualized, cursor, chunkIndex, lineRowIndexes, scrollToRow]);

  // Use side-by-side component for split mode
  if (mode === "split") {
    return (
      <SideBySideDiffChunk
        chunk={chunk}
        chunkIndex={chunkIndex}
        threads={threads}
        showAuthorBadges={showAuthorBadges}
        onAddComment={onAddComment}
        onGenerateThreadPrompt={onGenerateThreadPrompt}
        onRemoveThread={onRemoveThread}
        onReplyToThread={onReplyToThread}
        onRemoveMessage={onRemoveMessage}
        onUpdateMessage={onUpdateMessage}
        onOpenInEditor={onOpenInEditor}
        syntaxTheme={syntaxTheme}
        cursor={cursor}
        fileIndex={fileIndex}
        onLineClick={onLineClick}
        filename={filename}
        commentTrigger={commentTrigger}
        onCommentTriggerHandled={onCommentTriggerHandled}
      />
    );
  }

  const renderLineRow = (lineIndex: number, virtualItem?: VirtualItem) => {
    const line = chunk.lines[lineIndex];
    if (!line) return null;

    // Determine which line number and side to use for fetching comments
    // Delete lines: use oldLineNumber and 'old' side
    // Add/normal lines: use newLineNumber and 'new' side
    const commentLineNumber = line.type === "delete" ? line.oldLineNumber : line.newLineNumber;
    const commentSide: DiffSide = line.type === "delete" ? "old" : "new";
    // Generate ID for all lines to match the format used in useKeyboardNavigation
    const lineId = `file-${fileIndex}-chunk-${chunkIndex}-line-${lineIndex}`;
    const isCurrentLine =
      cursor && cursor.chunkIndex === chunkIndex && cursor.lineIndex === lineIndex;
    const selection = commentLineNumber
      ? { side: commentSide, lineNumber: commentLineNumber }
      : null;

    return (
      <DiffLineRow
        key={virtualItem ? virtualItem.key : `line-${lineIndex}`}
        ref={virtualItem ? measureRow : undefined}
        dataIndex={virtualItem?.index}
        line={line}
        index={lineIndex}
        lineId={lineId}
        isCurrentLine={isCurrentLine || false}
        hoveredLineIndex={hoveredLine}
        selectedLineStyle={getSelectedLineStyle(
          line.newLineNumber || line.oldLineNumber,
          line.type === "delete" ? "old" : "new",
        )}
        onMouseEnter={() => {
          setHoveredLine(lineIndex);
        }}
        onMouseLeave={() => setHoveredLine(null)}
        onMouseMove={() => {
          if (isDragging && startLine) {
            const lineNumber = line.newLineNumber || line.oldLineNumber;
            if (lineNumber) {
              setEndLine(lineNumber);
            }
          }
        }}
        onCommentButtonMouseDown={(e) => {
          e.stopPropagation();
          if (e.shiftKey) {
            e.preventDefault();
          }
          handleCommentButtonMouseDown({
            isShiftClick: e.shiftKey,
            selection,
          });
        }}
        onOpenInEditor={
          onOpenInEditor &&
          filename &&
          line.type !== "delete" &&
          (line.newLineNumber || line.oldLineNumber)
            ? () => {
                const lineNumber = line.newLineNumber || line.oldLineNumber;
                if (!lineNumber) return;
                if (!filename) return;
                onOpenInEditor(filename, lineNumber);
              }
            : undefined
        }
        syntaxTheme={syntaxTheme}
        filename={filename}
        diffSegments={wordDiffResolver(lineIndex)}
        onClick={(e) => {
          // Determine the side based on line type for unified mode
          const side = line.type === "delete" ? "left" : "right";
          if (e.shiftKey) {
            e.preventDefault();
          }
          handleRowClick({
            isShiftClick: e.shiftKey,
            lineIndex,
            navigationSide: side,
            selection,
          });
        }}
      />
    );
  };

  const renderThreadRow = (
    thread: CommentThread,
    anchorLine: DiffLine,
    virtualItem?: VirtualItem,
  ) => {
    const layout = getCommentLayout(anchorLine);
    return (
      <tr
        key={virtualItem ? virtualItem.key : thread.id}
        ref={virtualItem ? measureRow : undefined}
        data-index={virtualItem?.index}
        className="bg-github-bg-secondary"
      >
        <td colSpan={3} className="p-0 border-t border-github-border">
          <div
            className={`flex ${
              layout === "left"
                ? "justify-start"
                : layout === "right"
                  ? "justify-end"
                  : "justify-center"
            }`}
          >
            <div className={`${layout === "full" ? "w-full" : "w-1/2"} m-2 mx-4`}>
              <CommentThreadCard
                thread={thread}
                showAuthorBadges={showAuthorBadges}
                onGeneratePrompt={onGenerateThreadPrompt}
                onRemoveThread={onRemoveThread}
                onReplyToThread={onReplyToThread}
                onRemoveMessage={onRemoveMessage}
                onUpdateMessage={onUpdateMessage}
                syntaxTheme={syntaxTheme}
              />
            </div>
          </div>
        </td>
      </tr>
    );
  };

  const renderFormRow = (lineIndex: number, virtualItem?: VirtualItem) => {
    const line = chunk.lines[lineIndex];
    if (!line) return null;

    return (
      <tr
        key={virtualItem ? virtualItem.key : `form-${lineIndex}`}
        ref={virtualItem ? measureRow : undefined}
        data-index={virtualItem?.index}
        className="bg-[var(--bg-secondary)]"
      >
        <td colSpan={3} className="p-0">
          <div
            className={`flex ${
              getCommentLayout(line) === "left"
                ? "justify-start"
                : getCommentLayout(line) === "right"
                  ? "justify-end"
                  : "justify-center"
            }`}
          >
            <div className={`${getCommentLayout(line) === "full" ? "w-full" : "w-1/2"}`}>
              <CommentForm
                onSubmit={handleSubmitComment}
                onCancel={handleCancelComment}
                selectedCode={getSelectedCodeContent()}
                syntaxTheme={syntaxTheme}
                filename={filename}
              />
            </div>
          </div>
        </td>
      </tr>
    );
  };

  const renderRow = (row: (typeof flatRows)[number], virtualItem?: VirtualItem) => {
    if (row.kind === "line") {
      return renderLineRow(row.lineIndex, virtualItem);
    }
    if (row.kind === "thread" && row.thread) {
      const anchorLine = chunk.lines[row.lineIndex];
      return anchorLine ? renderThreadRow(row.thread, anchorLine, virtualItem) : null;
    }
    return renderFormRow(row.lineIndex, virtualItem);
  };

  return (
    <div ref={anchorRef} className="bg-github-bg-primary">
      <table className="w-full table-fixed border-collapse font-mono text-sm leading-5">
        <tbody>
          {!virtualized && flatRows.map((row) => renderRow(row))}
          {virtualized && (
            <>
              {paddingTop > 0 && (
                <tr data-virtual-spacer="top" aria-hidden="true">
                  <td colSpan={3} className="p-0 border-0" style={{ height: paddingTop }} />
                </tr>
              )}
              {virtualItems.map((virtualItem) => {
                const row = flatRows[virtualItem.index];
                return row ? renderRow(row, virtualItem) : null;
              })}
              {paddingBottom > 0 && (
                <tr data-virtual-spacer="bottom" aria-hidden="true">
                  <td colSpan={3} className="p-0 border-0" style={{ height: paddingBottom }} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
});
