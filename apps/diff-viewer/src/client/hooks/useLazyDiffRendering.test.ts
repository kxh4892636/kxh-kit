import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";

import { type DiffFile, type DiffResponse } from "../../types/diff";

import { getFileElementId } from "../utils/domUtils";

import { useLazyDiffRendering } from "./useLazyDiffRendering";

function renderLazyDiffRendering(container: HTMLElement | null) {
  return renderHook(() =>
    useLazyDiffRendering({
      diffData: null,
      diffScrollContainerRef: { current: container },
      fileListAnchorRef: { current: null },
      setDiffData: () => {},
    }),
  );
}

const createDiffData = (
  files: DiffFile[],
  overrides: Partial<DiffResponse> = {},
): DiffResponse => ({
  commit: "target-sha",
  repositoryId: "repository-a",
  requestedBaseCommitish: "main",
  requestedTargetCommitish: "feature",
  requestedBaseMode: "merge-base",
  baseCommitish: "base-sha",
  targetCommitish: "target-sha",
  files,
  ...overrides,
});

const createFile = (path: string, overrides: Partial<DiffFile> = {}): DiffFile => ({
  path,
  status: "modified",
  additions: 1,
  deletions: 0,
  chunks: [],
  isGenerated: false,
  ...overrides,
});

const renderDiffData = (
  diffData: DiffResponse,
  setDiffData: React.Dispatch<React.SetStateAction<DiffResponse | null>> = (): void => {},
): ReturnType<typeof renderLazyDiffRendering> =>
  renderHook(
    (): ReturnType<typeof useLazyDiffRendering> =>
      useLazyDiffRendering({
        diffData,
        diffScrollContainerRef: { current: null },
        fileListAnchorRef: { current: null },
        setDiffData,
      }),
  );

function stubRect(element: HTMLElement, top: number) {
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + 100,
      left: 0,
      right: 0,
      width: 0,
      height: 100,
    }) as DOMRect;
}

describe("useLazyDiffRendering", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("generated status", (): void => {
    it("marks a visible regular file generated without changing unrelated files", async (): Promise<void> => {
      const sourceFile = createFile("src/generated.ts");
      const alreadyGenerated = createFile("src/vendor.ts", { isGenerated: true });
      const diffData = createDiffData([sourceFile, alreadyGenerated]);
      const updates: Array<React.SetStateAction<DiffResponse | null>> = [];
      const setDiffData = vi.fn((update: React.SetStateAction<DiffResponse | null>): void => {
        updates.push(update);
      });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: (): Promise<{ isGenerated: boolean }> => Promise.resolve({ isGenerated: true }),
      });
      vi.stubGlobal("fetch", fetchMock);

      renderDiffData(diffData, setDiffData);

      await waitFor((): void => {
        expect(setDiffData).toHaveBeenCalledOnce();
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/generated-status/src%2Fgenerated.ts?ref=target-sha",
      );

      const update = updates[0];
      expect(typeof update).toBe("function");
      if (typeof update !== "function") return;

      expect(update(null)).toBeNull();
      const staleDiff = { ...diffData, requestedTargetCommitish: "other" };
      expect(update(staleDiff)).toBe(staleDiff);

      const updated = update(diffData);
      expect(updated?.files).toEqual([{ ...sourceFile, isGenerated: true }, alreadyGenerated]);
      expect(update(updated)).toBe(updated);
    });

    it("ignores non-generated and unsuccessful responses", async (): Promise<void> => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: (): Promise<{ isGenerated: boolean }> => Promise.resolve({ isGenerated: false }),
        })
        .mockResolvedValueOnce({ ok: false });
      vi.stubGlobal("fetch", fetchMock);
      const setDiffData = vi.fn();

      renderDiffData(createDiffData([createFile("src/a.ts"), createFile("src/b.ts")]), setDiffData);

      await waitFor((): void => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
      await Promise.resolve();
      expect(setDiffData).not.toHaveBeenCalled();
    });

    it("skips stdin, deleted, and already generated targets", (): void => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      renderDiffData(
        createDiffData(
          [
            createFile("src/deleted.ts", { status: "deleted" }),
            createFile("src/vendor.ts", { isGenerated: true }),
          ],
          { targetCommitish: "stdin" },
        ),
      );

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps the regular viewer when generated-status lookup rejects", async (): Promise<void> => {
      const error = new Error("network unavailable");
      const fetchMock = vi.fn().mockRejectedValue(error);
      const warn = vi.spyOn(console, "warn").mockImplementation((): void => {});
      vi.stubGlobal("fetch", fetchMock);

      renderDiffData(createDiffData([createFile("src/a.ts")], { targetCommitish: "" }));

      await waitFor((): void => {
        expect(warn).toHaveBeenCalledWith(
          "Failed to resolve generated status; keeping the regular diff viewer",
          { error, filePath: "src/a.ts", ref: "HEAD" },
        );
      });
    });
  });

  describe("isFileScrolledPastContainerTop", () => {
    const filePath = "src/example.ts";

    function setup(containerTop: number, targetTop: number) {
      const container = document.createElement("div");
      stubRect(container, containerTop);
      const target = document.createElement("div");
      target.id = getFileElementId(filePath);
      stubRect(target, targetTop);
      document.body.appendChild(target);

      return renderLazyDiffRendering(container);
    }

    it("returns true when the file header is scrolled above the container top", () => {
      const { result } = setup(50, 20);
      expect(result.current.isFileScrolledPastContainerTop(filePath)).toBe(true);
    });

    it("returns false when the file header is visible below the container top", () => {
      const { result } = setup(50, 120);
      expect(result.current.isFileScrolledPastContainerTop(filePath)).toBe(false);
    });

    it("returns false when the file header is aligned with the container top", () => {
      const { result } = setup(50, 50);
      expect(result.current.isFileScrolledPastContainerTop(filePath)).toBe(false);
    });

    it("returns false when the scroll container is not available", () => {
      const target = document.createElement("div");
      target.id = getFileElementId(filePath);
      stubRect(target, 0);
      document.body.appendChild(target);

      const { result } = renderLazyDiffRendering(null);
      expect(result.current.isFileScrolledPastContainerTop(filePath)).toBe(false);
    });

    it("returns false when the file element does not exist", () => {
      const container = document.createElement("div");
      stubRect(container, 0);

      const { result } = renderLazyDiffRendering(container);
      expect(result.current.isFileScrolledPastContainerTop("missing/file.ts")).toBe(false);
    });
  });
});
