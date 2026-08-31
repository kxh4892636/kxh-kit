import { type VirtualItem } from "@tanstack/react-virtual";
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
  navigationContext: string;
}

interface FileWindow {
  fileIndexes: number[];
  renderedFilePaths: Set<string>;
  paddingTop: number;
  paddingBottom: number;
  measureFile: (node: HTMLElement | null) => void;
  ensureFileMounted: (filePath: string) => void;
}

/**
 * 为完整 diff 文件序列提供有界 windowing，并隐藏挂载后 DOM-id 导航的时序。
 */
export const useFileWindow = (options: UseFileWindowOptions): FileWindow => {
  const { filePaths, anchorRef, navigationContext } = options;
  const navigationScope = useMemo(
    (): string => [navigationContext, ...filePaths].join("\u0000"),
    [filePaths, navigationContext],
  );
  const virtualWindow = useScrollVirtualizer({
    itemCount: filePaths.length,
    estimateItemSize: (): number => ESTIMATED_FILE_HEIGHT,
    anchorRef,
    enabled: filePaths.length > VIRTUALIZED_FILE_THRESHOLD,
    overscan: VIRTUALIZED_FILE_OVERSCAN,
    navigationScope,
  });
  const allFileIndexes = useMemo(
    (): number[] => filePaths.map((_filePath: string, fileIndex: number): number => fileIndex),
    [filePaths],
  );
  const fileIndexes = useMemo(
    (): number[] =>
      virtualWindow.virtualized
        ? virtualWindow.virtualItems.map((virtualItem: VirtualItem): number => virtualItem.index)
        : allFileIndexes,
    [allFileIndexes, virtualWindow.virtualItems, virtualWindow.virtualized],
  );
  const renderedFilePaths = useMemo(
    (): Set<string> =>
      new Set(
        fileIndexes
          .map((fileIndex: number): string | undefined => filePaths[fileIndex])
          .filter((filePath: string | undefined): filePath is string => filePath !== undefined),
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
      if (virtualWindow.virtualized) {
        virtualWindow.ensureItemMounted(fileIndex, elementId);
        return;
      }

      requestAnimationFrame((): void => scrollToElement(elementId));
    },
    [filePaths, scrollToElement, virtualWindow.ensureItemMounted, virtualWindow.virtualized],
  );

  return {
    fileIndexes,
    renderedFilePaths,
    paddingTop: virtualWindow.paddingTop,
    paddingBottom: virtualWindow.paddingBottom,
    measureFile: virtualWindow.measureItem,
    ensureFileMounted,
  };
};
