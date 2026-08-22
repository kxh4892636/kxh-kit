import { useCallback, useEffect, useMemo, useRef } from "react";

import { type DiffFile, type DiffResponse } from "../../types/diff";
import { useFileWindow } from "../virtualization/use-file-window";
import { getFileElementId } from "../utils/domUtils";

interface UseLazyDiffRenderingOptions {
  diffData: DiffResponse | null;
  diffScrollContainerRef: React.RefObject<HTMLElement | null>;
  fileListAnchorRef: React.RefObject<HTMLElement | null>;
  setDiffData: React.Dispatch<React.SetStateAction<DiffResponse | null>>;
}

interface UseLazyDiffRenderingReturn {
  renderedFilePaths: Set<string>;
  fileIndexes: number[];
  paddingTop: number;
  paddingBottom: number;
  measureFile: (node: HTMLElement | null) => void;
  ensureFileMounted: (filePath: string) => void;
  scrollFileIntoDiffContainer: (filePath: string) => void;
  isFileScrolledPastContainerTop: (filePath: string) => boolean;
}

/**
 * 编排 diff 文件 windowing、跨文件导航与可见文件的 generated-status 补查。
 */
export function useLazyDiffRendering({
  diffData,
  diffScrollContainerRef,
  fileListAnchorRef,
  setDiffData,
}: UseLazyDiffRenderingOptions): UseLazyDiffRenderingReturn {
  const generatedStatusCheckedRef = useRef<Set<string>>(new Set());
  const generatedStatusRevisionRef = useRef<string | null>(null);
  const filePaths = useMemo(
    (): string[] => diffData?.files.map((file: DiffFile): string => file.path) ?? [],
    [diffData],
  );
  const fileWindow = useFileWindow({ filePaths, anchorRef: fileListAnchorRef });

  useEffect((): void => {
    const revisionKey = diffData
      ? `${diffData.requestedBaseCommitish ?? ""}:${diffData.requestedTargetCommitish ?? ""}:${diffData.requestedBaseMode ?? "direct"}`
      : null;
    if (generatedStatusRevisionRef.current === revisionKey) return;
    generatedStatusRevisionRef.current = revisionKey;
    generatedStatusCheckedRef.current.clear();
  }, [diffData]);

  const isFileScrolledPastContainerTop = useCallback(
    (filePath: string): boolean => {
      const scrollContainer = diffScrollContainerRef.current;
      const target = document.getElementById(getFileElementId(filePath));
      if (!scrollContainer || !target) return false;

      const containerRect = scrollContainer.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      return targetRect.top < containerRect.top - 1;
    },
    [diffScrollContainerRef],
  );

  useEffect((): void => {
    if (!diffData || diffData.targetCommitish === "stdin") return;

    const ref = diffData.targetCommitish || "HEAD";
    const generatedStatusRevisionKey = `${diffData.requestedBaseCommitish ?? ""}...${diffData.requestedTargetCommitish ?? ""}:${diffData.requestedBaseMode ?? "direct"}`;

    diffData.files.forEach((file: DiffFile): void => {
      if (
        !fileWindow.renderedFilePaths.has(file.path) ||
        file.isGenerated !== false ||
        file.status === "deleted"
      ) {
        return;
      }

      const cacheKey = `${generatedStatusRevisionKey}:${ref}:${file.path}`;
      if (generatedStatusCheckedRef.current.has(cacheKey)) return;
      generatedStatusCheckedRef.current.add(cacheKey);

      const encodedPath = encodeURIComponent(file.path);
      fetch(`/api/generated-status/${encodedPath}?ref=${encodeURIComponent(ref)}`)
        .then((response: Response): Promise<{ isGenerated?: unknown }> | null =>
          response.ok ? response.json() : null,
        )
        .then((payload: { isGenerated?: unknown } | null): void => {
          if (!payload || payload.isGenerated !== true) return;

          setDiffData((previous: DiffResponse | null): DiffResponse | null => {
            if (!previous) return previous;
            if (
              previous.requestedBaseCommitish !== diffData.requestedBaseCommitish ||
              previous.requestedTargetCommitish !== diffData.requestedTargetCommitish ||
              previous.requestedBaseMode !== diffData.requestedBaseMode
            ) {
              return previous;
            }

            let changed = false;
            const nextFiles = previous.files.map((candidate: DiffFile): DiffFile => {
              if (candidate.path !== file.path || candidate.isGenerated) return candidate;
              changed = true;
              return { ...candidate, isGenerated: true };
            });
            return changed ? { ...previous, files: nextFiles } : previous;
          });
        })
        .catch((error: unknown): void => {
          console.warn("Failed to resolve generated status; keeping the regular diff viewer", {
            error,
            filePath: file.path,
            ref,
          });
        });
    });
  }, [diffData, fileWindow.renderedFilePaths, setDiffData]);

  return {
    renderedFilePaths: fileWindow.renderedFilePaths,
    fileIndexes: fileWindow.fileIndexes,
    paddingTop: fileWindow.paddingTop,
    paddingBottom: fileWindow.paddingBottom,
    measureFile: fileWindow.measureFile,
    ensureFileMounted: fileWindow.ensureFileMounted,
    scrollFileIntoDiffContainer: fileWindow.ensureFileMounted,
    isFileScrolledPastContainerTop,
  };
}
