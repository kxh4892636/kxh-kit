import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { DiffFile } from "../../types/diff";

import { ImageDiffViewer } from "./ImageDiffViewer";
import type { DiffViewerBodyProps } from "./types";

// fork 适配: 组件改为经 fetch 拉 blob 后构造 Object URL (见 ImageDiffViewer.tsx 头注释),
// 测试相应 mock fetch 的 arrayBuffer 响应与 URL.createObjectURL/revokeObjectURL
describe("ImageDiffViewer", () => {
  const baseProps: Omit<DiffViewerBodyProps, "file"> = {
    threads: [],
    diffMode: "unified",
    mergedChunks: [],
    isExpandLoading: false,
    expandHiddenLines: vi.fn().mockResolvedValue(undefined),
    expandAllBetweenChunks: vi.fn().mockResolvedValue(undefined),
    onAddComment: vi.fn().mockResolvedValue(undefined),
    onGenerateThreadPrompt: vi.fn(),
    onRemoveThread: vi.fn(),
    onReplyToThread: vi.fn().mockResolvedValue(undefined),
    onRemoveMessage: vi.fn(),
    onUpdateMessage: vi.fn(),
  };

  let objectUrlCounter = 0;

  const renderViewer = (file: DiffFile, overrides: Partial<DiffViewerBodyProps> = {}) =>
    render(<ImageDiffViewer {...baseProps} file={file} {...overrides} />);

  beforeEach(() => {
    vi.clearAllMocks();
    objectUrlCounter = 0;
    delete (window as Window & { __DIFIT_STATIC_BLOB_URLS__?: Record<string, string> })
      .__DIFIT_STATIC_BLOB_URLS__;
    // blob 响应供 handleImageLoad 读取文件大小, arrayBuffer 供 useImageObjectUrl 构造 Blob
    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      blob: () => Promise.resolve({ size: 1024 }),
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => `blob:mock-${++objectUrlCounter}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  describe("File status handling", () => {
    it("renders deleted image correctly", async () => {
      const deletedFile: DiffFile = {
        path: "test.jpg",
        oldPath: "test.jpg",
        status: "deleted",
        additions: 0,
        deletions: 1,
        chunks: [],
      };

      renderViewer(deletedFile);

      expect(screen.getByText("Deleted Image")).toBeInTheDocument();
      expect(screen.getByText("Previous version:")).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByRole("img")).toHaveAttribute("src", "blob:mock-1");
      });
      // 删除的文件不请求 target 侧 (不存在)
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith("/api/blob/test.jpg?ref=HEAD~1");
    });

    it("renders added image correctly", async () => {
      const addedFile: DiffFile = {
        path: "test.jpg",
        status: "added",
        additions: 1,
        deletions: 0,
        chunks: [],
      };

      renderViewer(addedFile);

      expect(screen.getByText("Added Image")).toBeInTheDocument();
      expect(screen.getByText("New file:")).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByRole("img")).toHaveAttribute("src", "blob:mock-1");
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith("/api/blob/test.jpg?ref=HEAD");
    });

    it("renders modified image correctly in split mode", async () => {
      const modifiedFile: DiffFile = {
        path: "test.jpg",
        oldPath: "test.jpg",
        status: "modified",
        additions: 1,
        deletions: 1,
        chunks: [],
      };

      renderViewer(modifiedFile, { diffMode: "split" });

      expect(screen.getByText("Modified Image")).toBeInTheDocument();
      expect(screen.getByText("Previous version:")).toBeInTheDocument();
      expect(screen.getByText("Current version:")).toBeInTheDocument();

      const images = screen.getAllByRole("img");
      expect(images).toHaveLength(2);
      await waitFor(() => {
        expect(images[0]).toHaveAttribute("src", "blob:mock-1");
        expect(images[1]).toHaveAttribute("src", "blob:mock-2");
      });
    });

    it("handles renamed image correctly", async () => {
      const renamedFile: DiffFile = {
        path: "new-name.jpg",
        oldPath: "old-name.jpg",
        status: "renamed",
        additions: 0,
        deletions: 0,
        chunks: [],
      };

      renderViewer(renamedFile);

      expect(screen.getByText("Modified Image")).toBeInTheDocument();

      const images = screen.getAllByRole("img");
      await waitFor(() => {
        expect(images[0]).toHaveAttribute("src", "blob:mock-1");
        expect(images[1]).toHaveAttribute("src", "blob:mock-2");
      });
      expect(global.fetch).toHaveBeenCalledWith("/api/blob/old-name.jpg?ref=HEAD~1");
      expect(global.fetch).toHaveBeenCalledWith("/api/blob/new-name.jpg?ref=HEAD");
    });
  });

  describe("Image loading with custom refs", () => {
    it("sets correct image src URLs with custom commitish", async () => {
      const file: DiffFile = {
        path: "test.jpg",
        oldPath: "old-test.jpg",
        status: "modified",
        additions: 1,
        deletions: 1,
        chunks: [],
      };

      renderViewer(file, { baseCommitish: "main", targetCommitish: "feature" });

      const images = screen.getAllByRole("img");
      await waitFor(() => {
        expect(images[0]).toHaveAttribute("src", "blob:mock-1");
        expect(images[1]).toHaveAttribute("src", "blob:mock-2");
      });
      expect(global.fetch).toHaveBeenCalledWith("/api/blob/old-test.jpg?ref=main");
      expect(global.fetch).toHaveBeenCalledWith("/api/blob/test.jpg?ref=feature");
    });

    it("uses default refs when not provided", async () => {
      const file: DiffFile = {
        path: "test.jpg",
        oldPath: "old-test.jpg",
        status: "modified",
        additions: 1,
        deletions: 1,
        chunks: [],
      };

      renderViewer(file);

      const images = screen.getAllByRole("img");
      await waitFor(() => {
        expect(images[0]).toHaveAttribute("src", "blob:mock-1");
        expect(images[1]).toHaveAttribute("src", "blob:mock-2");
      });
      expect(global.fetch).toHaveBeenCalledWith("/api/blob/old-test.jpg?ref=HEAD~1");
      expect(global.fetch).toHaveBeenCalledWith("/api/blob/test.jpg?ref=HEAD");
    });

    it("uses static blob URLs when available", () => {
      (
        window as Window & { __DIFIT_STATIC_BLOB_URLS__?: Record<string, string> }
      ).__DIFIT_STATIC_BLOB_URLS__ = {
        "abcdef1:test.jpg": "/difit/site-data/blobs/abcdef1/test.jpg",
      };
      const file: DiffFile = {
        path: "test.jpg",
        status: "added",
        additions: 1,
        deletions: 0,
        chunks: [],
      };

      renderViewer(file, { targetCommitish: "abcdef1234567890" });

      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "/difit/site-data/blobs/abcdef1/test.jpg",
      );
      // 静态导出模式不经过 fetch
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("Image information display", () => {
    it("shows image dimensions and file size when available", async () => {
      const file: DiffFile = {
        path: "test.jpg",
        status: "added",
        additions: 1,
        deletions: 0,
        chunks: [],
      };

      renderViewer(file);

      const image = screen.getByRole("img");
      await waitFor(() => {
        expect(image).toHaveAttribute("src", "blob:mock-1");
      });

      // Mock naturalWidth and naturalHeight
      Object.defineProperty(image, "naturalWidth", { value: 800, configurable: true });
      Object.defineProperty(image, "naturalHeight", { value: 600, configurable: true });

      // Simulate image load
      const loadEvent = new Event("load");
      image.dispatchEvent(loadEvent);

      // Wait for the state to update and info to be displayed
      await waitFor(() => {
        expect(screen.getByText(/W: 800px \| H: 600px/)).toBeInTheDocument();
        expect(screen.getByText(/1\.0 KB/)).toBeInTheDocument();
      });
    });
  });
});
