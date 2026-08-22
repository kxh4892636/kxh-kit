import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";

import { DiffChunk } from "../components/DiffChunk";
import { ExpandButton } from "../components/ExpandButton";
import {
  ESTIMATED_CODE_ROW_HEIGHT,
  ESTIMATED_EXPAND_CONTROL_HEIGHT,
  VIRTUALIZED_CHUNK_OVERSCAN,
  VIRTUALIZED_LINE_THRESHOLD,
} from "../virtualization/constants";
import { useScrollVirtualizer } from "../virtualization/use-scroll-virtualizer";

import type { DiffViewerBodyProps } from "./types";

export const TextDiffViewer = ({
  file,
  threads,
  showAuthorBadges,
  diffMode,
  syntaxTheme,
  cursor,
  fileIndex,
  mergedChunks,
  isExpandLoading,
  expandHiddenLines,
  expandAllBetweenChunks,
  onAddComment,
  onGenerateThreadPrompt,
  onRemoveThread,
  onReplyToThread,
  onRemoveMessage,
  onUpdateMessage,
  onLineClick,
  onOpenInEditor,
  commentTrigger,
  onCommentTriggerHandled,
}: DiffViewerBodyProps): ReactNode => {
  const renderExpandButton = (
    position: "top" | "middle" | "bottom",
    mergedChunk: (typeof mergedChunks)[number],
    firstOriginalIndex: number,
    lastOriginalIndex: number,
  ): ReactNode => {
    if (position === "top" && mergedChunk.hiddenLinesBefore > 0) {
      return (
        <ExpandButton
          direction="down"
          hiddenLines={mergedChunk.hiddenLinesBefore}
          onExpandDown={() => expandHiddenLines(file, firstOriginalIndex, "up")}
          onExpandAll={() =>
            expandAllBetweenChunks(file, firstOriginalIndex, mergedChunk.hiddenLinesBefore)
          }
          isLoading={isExpandLoading}
        />
      );
    }

    if (position === "middle" && mergedChunk.hiddenLinesBefore > 0) {
      return (
        <ExpandButton
          direction="both"
          hiddenLines={mergedChunk.hiddenLinesBefore}
          onExpandUp={() => expandHiddenLines(file, firstOriginalIndex - 1, "down")}
          onExpandDown={() => expandHiddenLines(file, firstOriginalIndex, "up")}
          onExpandAll={() =>
            expandAllBetweenChunks(file, firstOriginalIndex, mergedChunk.hiddenLinesBefore)
          }
          isLoading={isExpandLoading}
        />
      );
    }

    if (position === "bottom" && mergedChunk.hiddenLinesAfter > 0) {
      return (
        <ExpandButton
          direction="up"
          hiddenLines={mergedChunk.hiddenLinesAfter}
          onExpandUp={() => expandHiddenLines(file, lastOriginalIndex, "down")}
          onExpandAll={() =>
            expandHiddenLines(file, lastOriginalIndex, "down", mergedChunk.hiddenLinesAfter)
          }
          isLoading={isExpandLoading}
        />
      );
    }

    return null;
  };

  const totalLineCount = useMemo(
    (): number => mergedChunks.reduce((total, chunk): number => total + chunk.lines.length, 0),
    [mergedChunks],
  );
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const estimateChunkSize = useCallback(
    (mergedIndex: number): number => {
      const mergedChunk = mergedChunks[mergedIndex];
      if (!mergedChunk) return ESTIMATED_CODE_ROW_HEIGHT;
      const hasLeadingExpand = mergedChunk.hiddenLinesBefore > 0;
      const hasTrailingExpand =
        mergedIndex === mergedChunks.length - 1 && mergedChunk.hiddenLinesAfter > 0;
      const expandHeight =
        Number(hasLeadingExpand) * ESTIMATED_EXPAND_CONTROL_HEIGHT +
        Number(hasTrailingExpand) * ESTIMATED_EXPAND_CONTROL_HEIGHT;
      return mergedChunk.lines.length * ESTIMATED_CODE_ROW_HEIGHT + expandHeight;
    },
    [mergedChunks],
  );
  const { virtualized, virtualItems, paddingTop, paddingBottom, measureItem, ensureItemMounted } =
    useScrollVirtualizer({
      itemCount: mergedChunks.length,
      estimateItemSize: estimateChunkSize,
      anchorRef,
      enabled: mergedChunks.length > 1 && totalLineCount > VIRTUALIZED_LINE_THRESHOLD,
      overscan: VIRTUALIZED_CHUNK_OVERSCAN,
    });

  useEffect((): void => {
    if (!virtualized || !cursor) return;
    ensureItemMounted(cursor.chunkIndex);
  }, [virtualized, cursor, ensureItemMounted]);

  const renderChunk = (mergedIndex: number, measured = false): ReactNode => {
    const mergedChunk = mergedChunks[mergedIndex];
    if (!mergedChunk) return null;
    const isFirstMerged = mergedIndex === 0;
    const isLastMerged = mergedIndex === mergedChunks.length - 1;
    const firstOriginalIndex = mergedChunk.originalIndices[0] ?? 0;
    const lastOriginalIndex =
      mergedChunk.originalIndices[mergedChunk.originalIndices.length - 1] ?? 0;

    return (
      <div
        key={mergedIndex}
        ref={measured ? measureItem : undefined}
        data-index={measured ? mergedIndex : undefined}
        data-virtual-chunk={measured ? "true" : undefined}
        data-estimated-height={estimateChunkSize(mergedIndex)}
      >
        {isFirstMerged &&
          renderExpandButton("top", mergedChunk, firstOriginalIndex, lastOriginalIndex)}
        {!isFirstMerged &&
          renderExpandButton("middle", mergedChunk, firstOriginalIndex, lastOriginalIndex)}

        <div id={`chunk-${file.path.replace(/[^a-zA-Z0-9]/g, "-")}-${mergedIndex}`}>
          <DiffChunk
            chunk={mergedChunk}
            chunkIndex={mergedIndex}
            threads={threads}
            showAuthorBadges={showAuthorBadges}
            onAddComment={onAddComment}
            onGenerateThreadPrompt={onGenerateThreadPrompt}
            onRemoveThread={onRemoveThread}
            onReplyToThread={onReplyToThread}
            onRemoveMessage={onRemoveMessage}
            onUpdateMessage={onUpdateMessage}
            onOpenInEditor={onOpenInEditor}
            mode={diffMode}
            syntaxTheme={syntaxTheme}
            cursor={cursor && cursor.chunkIndex === mergedIndex ? cursor : null}
            fileIndex={fileIndex}
            onLineClick={onLineClick}
            commentTrigger={
              commentTrigger && commentTrigger.chunkIndex === mergedIndex ? commentTrigger : null
            }
            onCommentTriggerHandled={onCommentTriggerHandled}
            filename={file.path}
          />
        </div>

        {isLastMerged &&
          renderExpandButton("bottom", mergedChunk, firstOriginalIndex, lastOriginalIndex)}
      </div>
    );
  };

  return (
    <div ref={anchorRef}>
      {!virtualized && mergedChunks.map((_, mergedIndex) => renderChunk(mergedIndex))}
      {virtualized && (
        <>
          {paddingTop > 0 && <div aria-hidden="true" style={{ height: paddingTop }} />}
          {virtualItems.map((virtualItem) => renderChunk(virtualItem.index, true))}
          {paddingBottom > 0 && <div aria-hidden="true" style={{ height: paddingBottom }} />}
        </>
      )}
    </div>
  );
};
