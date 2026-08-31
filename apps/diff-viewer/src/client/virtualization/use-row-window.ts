import { useEffect, type RefObject } from "react";

import { VIRTUALIZED_LINE_OVERSCAN, VIRTUALIZED_LINE_THRESHOLD } from "./constants";
import { useScrollVirtualizer } from "./use-scroll-virtualizer";

interface UseRowWindowOptions {
  rowCount: number;
  estimateRowSize: (rowIndex: number) => number;
  anchorRef: RefObject<HTMLElement | null>;
  targetRowIndex?: number;
  targetElementId?: string;
}

type RowWindowResult = ReturnType<typeof useScrollVirtualizer>;

/** 为 unified/split 行模型统一阈值、overscan 与挂载后导航编排。 */
export const useRowWindow = (options: UseRowWindowOptions): RowWindowResult => {
  const { rowCount, estimateRowSize, anchorRef, targetRowIndex, targetElementId } = options;
  const window = useScrollVirtualizer({
    itemCount: rowCount,
    estimateItemSize: estimateRowSize,
    anchorRef,
    enabled: rowCount > VIRTUALIZED_LINE_THRESHOLD,
    overscan: VIRTUALIZED_LINE_OVERSCAN,
    navigationScope: `${targetRowIndex ?? "none"}\u0000${targetElementId ?? ""}`,
  });

  useEffect((): void => {
    if (!window.virtualized || targetRowIndex === undefined) return;
    window.ensureItemMounted(targetRowIndex, targetElementId);
  }, [window.virtualized, window.ensureItemMounted, targetRowIndex, targetElementId]);

  return window;
};
