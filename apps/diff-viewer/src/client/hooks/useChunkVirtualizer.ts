import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

import { NAVIGATION_SELECTORS } from "../constants/navigation";
import {
  VIRTUALIZED_CHUNK_OVERSCAN,
  VIRTUALIZED_CHUNK_ROW_THRESHOLD,
} from "../constants/virtualization";

interface UseChunkVirtualizerOptions {
  /** 压平后的行数 (代码行 + 评论卡片行 + 评论表单行) */
  rowCount: number;
  /** 按行类型给出高度估计, 挂载后由虚拟器动态测量校正 */
  estimateRowSize: (rowIndex: number) => number;
  /** chunk 根元素, 用于定位外层滚动容器并测量列表起点偏移 */
  anchorRef: RefObject<HTMLElement | null>;
}

interface UseChunkVirtualizerResult {
  /** 行数超过阈值, 启用窗口渲染 */
  virtualized: boolean;
  virtualItems: VirtualItem[];
  /** 视口上方/下方占位高度, 以 spacer 行撑出完整滚动区间 */
  paddingTop: number;
  paddingBottom: number;
  /** 挂到每一行 <tr> 上的 ref, 供虚拟器动态测量真实高度 */
  measureRow: (node: HTMLElement | null) => void;
  /** 把指定行滚动进视口 (cursor/评论跳转落到未挂载行时使用) */
  scrollToRow: (rowIndex: number) => void;
}

/**
 * 单个 diff chunk 的行级虚拟列表。滚动容器沿用全局约定的
 * `main.overflow-y-auto` (NAVIGATION_SELECTORS.SCROLL_CONTAINER),
 * 列表起点偏移通过 scrollMargin 告知虚拟器。
 */
export const useChunkVirtualizer = ({
  rowCount,
  estimateRowSize,
  anchorRef,
}: UseChunkVirtualizerOptions): UseChunkVirtualizerResult => {
  const virtualized = rowCount > VIRTUALIZED_CHUNK_ROW_THRESHOLD;
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    if (!virtualized) return;
    setScrollElement(
      anchorRef.current?.closest<HTMLElement>(NAVIGATION_SELECTORS.SCROLL_CONTAINER) ?? null,
    );
  }, [virtualized, anchorRef]);

  // scrollMargin = 列表起点相对滚动容器内容起点的偏移。滚动过程中保持不变,
  // 上方内容高度变化 (文件头折叠、其他 chunk 挂载) 时随每次 commit 重算;
  // 值未变时 setState 直接 bail out, 不会引起额外渲染。
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!virtualized || !scrollElement || !anchor) return;
    const margin =
      anchor.getBoundingClientRect().top -
      scrollElement.getBoundingClientRect().top +
      scrollElement.scrollTop;
    if (Number.isFinite(margin)) {
      setScrollMargin((prev) => (Math.abs(prev - margin) > 1 ? margin : prev));
    }
  });

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    estimateSize: estimateRowSize,
    overscan: VIRTUALIZED_CHUNK_OVERSCAN,
    scrollMargin,
    enabled: virtualized,
  });

  const virtualItems = virtualized ? virtualizer.getVirtualItems() : [];
  const totalSize = virtualized ? virtualizer.getTotalSize() : 0;
  const firstItem = virtualItems[0];
  const lastItem = virtualItems[virtualItems.length - 1];
  const paddingTop = firstItem ? Math.max(0, firstItem.start - scrollMargin) : 0;
  // 滚动容器尚未就位时 (首帧) 用估计总高度撑开, 避免页面高度塌陷导致滚动位置跳动
  const paddingBottom = lastItem
    ? Math.max(0, totalSize - (lastItem.end - scrollMargin))
    : totalSize;

  const scrollToRow = useCallback(
    (rowIndex: number) => {
      if (rowIndex < 0 || rowIndex >= rowCount) return;
      virtualizer.scrollToIndex(rowIndex, { align: "auto" });
    },
    [virtualizer, rowCount],
  );

  return {
    virtualized,
    virtualItems,
    paddingTop,
    paddingBottom,
    measureRow: virtualizer.measureElement,
    scrollToRow,
  };
};
