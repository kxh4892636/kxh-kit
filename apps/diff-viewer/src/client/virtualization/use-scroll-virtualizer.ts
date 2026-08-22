import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import { NAVIGATION_SELECTORS } from "../constants/navigation";
import { createScrollToElement } from "../hooks/keyboardNavigation/scrollUtils";

interface UseScrollVirtualizerOptions {
  itemCount: number;
  estimateItemSize: (itemIndex: number) => number;
  anchorRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  overscan: number;
}

interface UseScrollVirtualizerResult {
  virtualized: boolean;
  virtualItems: VirtualItem[];
  paddingTop: number;
  paddingBottom: number;
  measureItem: (node: HTMLElement | null) => void;
  ensureItemMounted: (itemIndex: number, elementId?: string) => void;
}

const NAVIGATION_MOUNT_ATTEMPTS = 5;

/**
 * 在全局 diff 滚动容器中提供 windowing，并在目标挂载后重试既有 DOM-id 滚动契约。
 */
export const useScrollVirtualizer = (
  options: UseScrollVirtualizerOptions,
): UseScrollVirtualizerResult => {
  const { itemCount, estimateItemSize, anchorRef, enabled, overscan } = options;
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const navigationRequestRef = useRef(0);

  useEffect((): void => {
    if (!enabled) return;
    setScrollElement(
      anchorRef.current?.closest<HTMLElement>(NAVIGATION_SELECTORS.SCROLL_CONTAINER) ?? null,
    );
  }, [enabled, anchorRef]);

  // 列表起点会受上方文件头与 chunk 高度变化影响，因此每次提交后重新校正。
  useLayoutEffect((): void => {
    const anchor = anchorRef.current;
    if (!enabled || !scrollElement || !anchor) return;
    const margin =
      anchor.getBoundingClientRect().top -
      scrollElement.getBoundingClientRect().top +
      scrollElement.scrollTop;
    if (Number.isFinite(margin)) {
      setScrollMargin((previous): number => (Math.abs(previous - margin) > 1 ? margin : previous));
    }
  });

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: (): HTMLElement | null => scrollElement,
    estimateSize: estimateItemSize,
    overscan,
    scrollMargin,
    enabled,
  });

  const virtualItems = enabled ? virtualizer.getVirtualItems() : [];
  const totalSize = enabled ? virtualizer.getTotalSize() : 0;
  const firstItem = virtualItems[0];
  const lastItem = virtualItems[virtualItems.length - 1];
  const paddingTop = firstItem ? Math.max(0, firstItem.start - scrollMargin) : 0;
  const paddingBottom = lastItem
    ? Math.max(0, totalSize - (lastItem.end - scrollMargin))
    : totalSize;
  const scrollToElement = useMemo(
    (): ReturnType<typeof createScrollToElement> => createScrollToElement(),
    [],
  );

  const ensureItemMounted = useCallback(
    (itemIndex: number, elementId?: string): void => {
      if (itemIndex < 0 || itemIndex >= itemCount) return;
      virtualizer.scrollToIndex(itemIndex, { align: "auto" });
      if (!elementId) return;

      const requestId = navigationRequestRef.current + 1;
      navigationRequestRef.current = requestId;
      let attempts = 0;
      const retryDomScroll = (): void => {
        requestAnimationFrame((): void => {
          if (navigationRequestRef.current !== requestId) return;
          if (document.getElementById(elementId)) {
            scrollToElement(elementId);
            return;
          }
          attempts += 1;
          if (attempts < NAVIGATION_MOUNT_ATTEMPTS) retryDomScroll();
        });
      };
      retryDomScroll();
    },
    [itemCount, scrollToElement, virtualizer],
  );

  return {
    virtualized: enabled,
    virtualItems,
    paddingTop,
    paddingBottom,
    measureItem: virtualizer.measureElement,
    ensureItemMounted,
  };
};
