import { useCallback, useMemo, type RefObject } from "react";

import { createScrollToElement } from "../hooks/keyboardNavigation/scrollUtils";
import { getFileElementId } from "../utils/domUtils";

import {
  ESTIMATED_FILE_HEIGHT,
  VIRTUALIZED_FILE_OVERSCAN,
  VIRTUALIZED_FILE_THRESHOLD,
} from "./constants";
import { useScrollVirtualizer } from "./use-scroll-virtualizer";

interface UseFileWindowOptions {
  filePaths: string[];
  anchorRef: RefObject<HTMLElement | null>;
}

interface FileWindow {
  fileIndexes: number[];
  renderedFilePaths: Set<string>;
  paddingTop: number;
  paddingBottom: number;
  measureFile: (node: HTMLElement | null) => void;
  ensureFileMounted: (filePath: string) => void;
}

const ALL_FILES_SCROLL_ATTEMPTS = 5;

/**
 * 为完整 diff 文件序列提供有界 windowing，并隐藏挂载后 DOM-id 导航的时序。
 */
export const useFileWindow = (options: UseFileWindowOptions): FileWindow => {
  const { filePaths, anchorRef } = options;
  const window = useScrollVirtualizer({
    itemCount: filePaths.length,
    estimateItemSize: (): number => ESTIMATED_FILE_HEIGHT,
    anchorRef,
    enabled: filePaths.length > VIRTUALIZED_FILE_THRESHOLD,
    overscan: VIRTUALIZED_FILE_OVERSCAN,
  });
  const allFileIndexes = useMemo(
    (): number[] => filePaths.map((_, fileIndex): number => fileIndex),
    [filePaths],
  );
  const fileIndexes = useMemo(
    (): number[] =>
      window.virtualized
        ? window.virtualItems.map((virtualItem): number => virtualItem.index)
        : allFileIndexes,
    [allFileIndexes, window.virtualItems, window.virtualized],
  );
  const renderedFilePaths = useMemo(
    (): Set<string> =>
      new Set(
        fileIndexes
          .map((fileIndex): string | undefined => filePaths[fileIndex])
          .filter((filePath): filePath is string => filePath !== undefined),
      ),
    [fileIndexes, filePaths],
  );
  const scrollToElement = useMemo(
    (): ReturnType<typeof createScrollToElement> => createScrollToElement(),
    [],
  );

  const ensureFileMounted = useCallback(
    (filePath: string): void => {
      const fileIndex = filePaths.indexOf(filePath);
      if (fileIndex < 0) return;
      const elementId = getFileElementId(filePath);
      if (window.virtualized) {
        window.ensureItemMounted(fileIndex, elementId);
        return;
      }

      let attempts = 0;
      const retryScroll = (): void => {
        requestAnimationFrame((): void => {
          if (document.getElementById(elementId)) {
            scrollToElement(elementId);
            return;
          }
          attempts += 1;
          if (attempts < ALL_FILES_SCROLL_ATTEMPTS) retryScroll();
        });
      };
      retryScroll();
    },
    [filePaths, scrollToElement, window.ensureItemMounted, window.virtualized],
  );

  return {
    fileIndexes,
    renderedFilePaths,
    paddingTop: window.paddingTop,
    paddingBottom: window.paddingBottom,
    measureFile: window.measureItem,
    ensureFileMounted,
  };
};
