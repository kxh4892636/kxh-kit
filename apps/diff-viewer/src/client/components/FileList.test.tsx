import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";

import type { CommentThread, DiffFile } from "../../types/diff";

import { FileList, type RepoFileGroup } from "./FileList";

const createFile = (
  path: string,
  totals: { additions?: number; deletions?: number } = {},
): DiffFile => ({
  path,
  status: "modified",
  additions: totals.additions ?? 1,
  deletions: totals.deletions ?? 1,
  chunks: [],
});

// 聚焦仓库单分组: 等价于 03 之前的单仓库平铺树
const focusedGroup = (files: DiffFile[], repoPath = "/repo"): RepoFileGroup => ({
  repoPath,
  repoName: repoPath.split("/").pop() ?? repoPath,
  files,
  isFocused: true,
});

const createComment = (file: string): CommentThread => ({
  id: `t-${file}`,
  file,
  line: 1,
  side: "new",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  messages: [],
});

const renderFileList = (groups: RepoFileGroup[], overrides: Record<string, unknown> = {}) =>
  render(
    <FileList
      groups={groups}
      onSelectFile={vi.fn()}
      comments={[]}
      reviewedFiles={new Set()}
      onToggleReviewed={vi.fn()}
      onToggleFolderReviewed={vi.fn()}
      selectedFileIndex={null}
      {...overrides}
    />,
  );

function getTreeRow(title: string): HTMLElement {
  const row = screen.getByTitle(title).closest<HTMLElement>('[data-tree-row="true"]');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function getLabel(title: string): HTMLElement {
  return screen.getByTitle(title);
}

describe("FileList", () => {
  it("renders total additions and deletions beside the file count", () => {
    renderFileList([
      focusedGroup([
        createFile("README.md", { additions: 3, deletions: 1 }),
        createFile("src/client/App.tsx", { additions: 2, deletions: 4 }),
      ]),
    ]);

    expect(screen.getByText("Files changed (2)")).toBeInTheDocument();
    expect(screen.getByLabelText("5 additions and 5 deletions")).toBeInTheDocument();
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByText("-5")).toBeInTheDocument();
  });

  it("strikes through directories when all descendant files are reviewed", () => {
    const files = [
      createFile("src/cli/index.ts"),
      createFile("src/client/App.tsx"),
      createFile("README.md"),
    ];
    const { rerender } = render(
      <FileList
        groups={[focusedGroup(files)]}
        onSelectFile={vi.fn()}
        comments={[]}
        reviewedFiles={new Set(["README.md", "src/cli/index.ts"])}
        onToggleReviewed={vi.fn()}
        onToggleFolderReviewed={vi.fn()}
        selectedFileIndex={null}
      />,
    );

    expect(getLabel("src")).not.toHaveClass("line-through");
    expect(getTreeRow("src")).not.toHaveClass("opacity-70");
    expect(getLabel("cli")).toHaveClass("line-through");
    expect(getTreeRow("cli")).toHaveClass("opacity-70");
    expect(getLabel("client")).not.toHaveClass("line-through");
    expect(getTreeRow("client")).not.toHaveClass("opacity-70");

    rerender(
      <FileList
        groups={[focusedGroup(files)]}
        onSelectFile={vi.fn()}
        comments={[]}
        reviewedFiles={new Set(["README.md", "src/cli/index.ts", "src/client/App.tsx"])}
        onToggleReviewed={vi.fn()}
        onToggleFolderReviewed={vi.fn()}
        selectedFileIndex={null}
      />,
    );

    expect(getLabel("src")).toHaveClass("line-through");
    expect(getTreeRow("src")).toHaveClass("opacity-70");
    expect(getLabel("cli")).toHaveClass("line-through");
    expect(getTreeRow("cli")).toHaveClass("opacity-70");
    expect(getLabel("client")).toHaveClass("line-through");
    expect(getTreeRow("client")).toHaveClass("opacity-70");
  });

  it("marks all files in a folder as reviewed via the directory checkbox", () => {
    const onToggleFolderReviewed = vi.fn();
    renderFileList(
      [
        focusedGroup([
          createFile("src/cli/index.ts"),
          createFile("src/client/App.tsx"),
          createFile("README.md"),
        ]),
      ],
      { onToggleFolderReviewed },
    );

    const checkbox = within(getTreeRow("src")).getByRole("checkbox");
    expect(checkbox).toHaveAttribute("aria-checked", "false");

    fireEvent.click(checkbox);
    expect(onToggleFolderReviewed).toHaveBeenCalledWith("src", true);
  });

  it("renders both a file row and directory children when a path is both a file and a directory prefix", () => {
    const onSelectFile = vi.fn();
    renderFileList(
      [
        focusedGroup([
          { ...createFile("vendor"), status: "deleted" },
          createFile("vendor/lib.ts"),
          createFile("vendor/utils.ts"),
        ]),
      ],
      { onSelectFile },
    );

    expect(screen.getByTitle("vendor/lib.ts")).toBeInTheDocument();
    expect(screen.getByTitle("vendor/utils.ts")).toBeInTheDocument();

    const vendorElements = screen.getAllByTitle("vendor");
    const vendorFileRow = vendorElements
      .map((el) => el.closest('[data-file-row="true"]'))
      .find(Boolean);
    expect(vendorFileRow).toBeDefined();
    fireEvent.click(vendorFileRow!);
    expect(onSelectFile).toHaveBeenCalledWith("/repo", "vendor");
  });

  it("unmarks all files in a fully reviewed folder via the directory checkbox", () => {
    const onToggleFolderReviewed = vi.fn();
    renderFileList(
      [focusedGroup([createFile("src/cli/index.ts"), createFile("src/client/App.tsx")])],
      {
        reviewedFiles: new Set(["src/cli/index.ts", "src/client/App.tsx"]),
        onToggleFolderReviewed,
      },
    );

    const checkbox = within(getTreeRow("src")).getByRole("checkbox");
    expect(checkbox).toHaveAttribute("aria-checked", "true");

    fireEvent.click(checkbox);
    expect(onToggleFolderReviewed).toHaveBeenCalledWith("src", false);
  });

  // issue 04: 多仓库同视图 —— 顶层按仓库分组, 聚合各勾选仓库激活对比的变更文件
  describe("多仓库分组 (issue 04)", () => {
    const twoRepoGroups = (): RepoFileGroup[] => [
      {
        repoPath: "/ws/app",
        repoName: "app",
        files: [createFile("a.txt", { additions: 2, deletions: 1 }), createFile("src/x.ts")],
        isFocused: true,
      },
      {
        repoPath: "/ws/lib",
        repoName: "lib",
        files: [createFile("b.txt", { additions: 4, deletions: 0 })],
        isFocused: false,
      },
    ];

    it("顶层按仓库分组展示全部变更文件, 计数与增删行聚合所有分组", () => {
      renderFileList(twoRepoGroups());

      const appGroup = screen.getByTestId("file-tree-repo-app");
      const libGroup = screen.getByTestId("file-tree-repo-lib");
      expect(within(appGroup).getByTitle("a.txt")).toBeInTheDocument();
      expect(within(appGroup).getByTitle("src/x.ts")).toBeInTheDocument();
      expect(within(libGroup).getByTitle("b.txt")).toBeInTheDocument();
      expect(within(appGroup).queryByTitle("b.txt")).not.toBeInTheDocument();

      expect(screen.getByText("Files changed (3)")).toBeInTheDocument();
      expect(screen.getByLabelText("7 additions and 2 deletions")).toBeInTheDocument();
    });

    it("点击文件回调携带其所属仓库 (聚焦与非聚焦一致)", () => {
      const onSelectFile = vi.fn();
      renderFileList(twoRepoGroups(), { onSelectFile });

      fireEvent.click(screen.getByTitle("b.txt"));
      expect(onSelectFile).toHaveBeenCalledWith("/ws/lib", "b.txt");

      fireEvent.click(screen.getByTitle("a.txt"));
      expect(onSelectFile).toHaveBeenCalledWith("/ws/app", "a.txt");
    });

    it("reviewed 勾选与评论计数只属于聚焦仓库, 不串到同名文件", () => {
      const groups = twoRepoGroups();
      groups[1]!.files = [createFile("a.txt")];
      renderFileList(groups, {
        reviewedFiles: new Set(["a.txt"]),
        comments: [createComment("a.txt")],
      });

      const appGroup = screen.getByTestId("file-tree-repo-app");
      const libGroup = screen.getByTestId("file-tree-repo-lib");
      // 聚焦组文件有 reviewed checkbox 与评论计数
      expect(within(appGroup).getAllByRole("checkbox").length).toBeGreaterThan(0);
      expect(within(appGroup).getByTestId("comment-count-a.txt")).toBeInTheDocument();
      // 非聚焦组不渲染 reviewed/评论设施 (其数据属于另一仓库的对比)
      expect(within(libGroup).queryByRole("checkbox")).not.toBeInTheDocument();
      expect(within(libGroup).queryByTestId("comment-count-a.txt")).not.toBeInTheDocument();
    });

    it("过滤跨分组生效: 无匹配的分组整体隐藏", () => {
      renderFileList(twoRepoGroups());

      fireEvent.change(screen.getByPlaceholderText("Filter files..."), {
        target: { value: "b.txt" },
      });

      expect(screen.queryByTestId("file-tree-repo-app")).not.toBeInTheDocument();
      expect(within(screen.getByTestId("file-tree-repo-lib")).getByTitle("b.txt"));
    });
  });
});
