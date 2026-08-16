// fork 改动 (client 第 5 处): issue 04 多仓库文件树 —— props 从单仓库
// files: DiffFile[] 改为 groups: RepoFileGroup[] (顶层按仓库分组, 聚合各勾选仓库
// 激活对比的变更文件); onScrollToFile 改为 onSelectFile(repoPath, filePath)
// (点击非聚焦仓库文件由宿主切换聚焦后再滚动); reviewed/评论设施仅渲染聚焦仓库分组
// (其数据来自主视图当前仓库的对比, 非聚焦分组展示会串仓库)。
// 单分组的目录树渲染 (树构建/折叠/sticky 目录头/行渲染/分组头) 拆至 FileTreeGroup.tsx
// (文件行数门禁); 本文件保留跨分组共享的派生视图与头部 (计数/过滤/全部折叠)。
// 其余 fork 改动清单见 main.tsx / useHighlightedCode.ts / ImageDiffViewer.tsx /
// App.tsx / DiffQuickMenu.tsx 文件头注释。
import { Search, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import { type DiffFile, type CommentThread } from "../../types/diff";

import {
  FileTreeGroup,
  buildFileTree,
  getAllDirectoryPaths,
  getReviewedDirectoryPaths,
  type TreeNode,
} from "./FileTreeGroup";

// 一个勾选仓库在文件树中的分组: 其激活对比的全部变更文件
export interface RepoFileGroup {
  repoPath: string;
  // 目录 basename; 空串 = 无仓库身份的回退平铺模式 (纯浏览器 dev / 无 bridge 单测),
  // 此时不渲染分组头, 外观与单仓库树一致
  repoName: string;
  files: DiffFile[];
  // 聚焦仓库 = 主视图当前展示 diff 的仓库; reviewed/评论/选中高亮只对聚焦组生效
  isFocused: boolean;
}

export interface FileListProps {
  groups: RepoFileGroup[];
  onSelectFile: (repoPath: string, filePath: string) => void;
  onFileSelected?: () => void;
  comments: CommentThread[];
  reviewedFiles: Set<string>;
  onToggleReviewed: (path: string) => void;
  onToggleFolderReviewed: (path: string, reviewed: boolean) => void;
  selectedFileIndex: number | null;
}

export const FileList = memo(function FileList({
  groups,
  onSelectFile,
  onFileSelected,
  comments,
  reviewedFiles,
  onToggleReviewed,
  onToggleFolderReviewed,
  selectedFileIndex,
}: FileListProps) {
  const groupTrees = useMemo(
    () => groups.map((group) => ({ group, tree: buildFileTree(group.files) })),
    [groups],
  );
  const scrollContainerRef: RefObject<HTMLDivElement | null> = useRef<HTMLDivElement>(null);
  const stickyContainerStyle = {
    "--dir-row-height": "calc(var(--spacing, 0.25rem) * 9)",
  } as CSSProperties;

  // 折叠状态以"显式折叠集合"记录: 默认全部展开, 勾选新仓库产生的
  // 新目录随之自动展开, 不会因初始化时机而默认收起
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(() => new Set());
  const [filterText, setFilterText] = useState("");

  const focusedEntry = useMemo(
    () => groupTrees.find((entry) => entry.group.isFocused) ?? null,
    [groupTrees],
  );

  const commentCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    comments.forEach((comment) => {
      counts.set(comment.file, (counts.get(comment.file) ?? 0) + 1);
    });
    return counts;
  }, [comments]);

  const fileIndexMap = useMemo(() => {
    const indices = new Map<string, number>();
    focusedEntry?.group.files.forEach((file, index) => {
      indices.set(file.path, index);
    });
    return indices;
  }, [focusedEntry]);
  const diffTotals = useMemo(
    () =>
      groups.reduce(
        (totals, group) => ({
          additions: totals.additions + group.files.reduce((sum, file) => sum + file.additions, 0),
          deletions: totals.deletions + group.files.reduce((sum, file) => sum + file.deletions, 0),
        }),
        { additions: 0, deletions: 0 },
      ),
    [groups],
  );
  const totalFileCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.files.length, 0),
    [groups],
  );
  const reviewedDirectoryPaths = useMemo(
    () =>
      focusedEntry
        ? getReviewedDirectoryPaths(focusedEntry.tree, reviewedFiles)
        : new Set<string>(),
    [focusedEntry, reviewedFiles],
  );

  // Filter each group's file tree; 过滤期间无匹配文件的分组整体隐藏
  const filteredGroupTrees = useMemo(() => {
    const normalizedFilter = filterText.trim().toLowerCase();

    const filterTreeNode = (node: TreeNode): TreeNode | null => {
      if (!normalizedFilter) return node;

      if (node.isDirectory && node.children) {
        const filteredChildren = node.children
          .map((child) => filterTreeNode(child))
          .filter((child) => child !== null);

        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      } else if (node.file) {
        // Check if file name matches filter
        if (node.file.path.toLowerCase().includes(normalizedFilter)) {
          return node;
        }
        return null;
      }

      return null;
    };

    return groupTrees
      .map(({ group, tree }) => {
        const filtered = filterTreeNode(tree) ?? { ...tree, children: [] };
        return { group, tree: filtered };
      })
      .filter(
        (entry) => !normalizedFilter || (entry.tree.children && entry.tree.children.length > 0),
      );
  }, [groupTrees, filterText]);

  const toggleDirectory = useCallback((nodeKey: string) => {
    setCollapsedDirs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeKey)) {
        newSet.delete(nodeKey);
      } else {
        newSet.add(nodeKey);
      }
      return newSet;
    });
  }, []);

  const allPaths = useMemo(
    () =>
      groupTrees.flatMap(({ group, tree }) =>
        getAllDirectoryPaths(tree).map((path) => `${group.repoPath}:${path}`),
      ),
    [groupTrees],
  );
  const isAllExpanded = allPaths.length > 0 && !allPaths.some((path) => collapsedDirs.has(path));

  const toggleAllDirectories = () => {
    // If all directories are expanded, collapse all. Otherwise, expand all.
    if (isAllExpanded) {
      setCollapsedDirs(new Set(allPaths));
    } else {
      setCollapsedDirs(new Set());
    }
  };

  // 跨分组共享的派生视图/回调各收敛为一个对象, 保持 FileTreeGroup 的 memo 有效
  const groupView = useMemo(
    () => ({
      collapsedDirs,
      reviewedFiles,
      reviewedDirectoryPaths,
      commentCountMap,
      fileIndexMap,
      selectedFileIndex,
    }),
    [
      collapsedDirs,
      reviewedFiles,
      reviewedDirectoryPaths,
      commentCountMap,
      fileIndexMap,
      selectedFileIndex,
    ],
  );
  const groupCallbacks = useMemo(
    () => ({
      onSelectFile,
      onFileSelected,
      onToggleReviewed,
      onToggleFolderReviewed,
      onToggleDirectory: toggleDirectory,
    }),
    [onSelectFile, onFileSelected, onToggleReviewed, onToggleFolderReviewed, toggleDirectory],
  );

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-github-border bg-github-bg-tertiary">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-github-text-primary m-0">
            Files changed ({totalFileCount})
          </h3>
          <div className="ml-auto flex items-center gap-2">
            <span
              className="inline-flex gap-1 text-right text-xs font-medium whitespace-nowrap"
              title="Total additions and deletions"
              aria-label={`${diffTotals.additions} additions and ${diffTotals.deletions} deletions`}
            >
              <span className="text-github-accent">+{diffTotals.additions}</span>
              <span className="text-github-danger">-{diffTotals.deletions}</span>
            </span>
            <button
              onClick={toggleAllDirectories}
              className="p-1 hover:bg-github-bg-primary rounded transition-colors"
              title={isAllExpanded ? "Collapse all" : "Expand all"}
            >
              {isAllExpanded ? (
                <ChevronsDownUp size={16} className="text-github-text-secondary" />
              ) : (
                <ChevronsUpDown size={16} className="text-github-text-secondary" />
              )}
            </button>
          </div>
        </div>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-github-text-muted"
          />
          <input
            type="text"
            placeholder="Filter files..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-github-bg-primary border border-github-border rounded-md focus:outline-none focus:border-github-accent text-github-text-primary placeholder-github-text-muted"
          />
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto relative z-0"
        style={stickyContainerStyle}
        ref={scrollContainerRef}
      >
        {filteredGroupTrees.map(({ group, tree }) => (
          <FileTreeGroup
            key={group.repoPath}
            group={group}
            tree={tree}
            view={groupView}
            callbacks={groupCallbacks}
            scrollContainerRef={scrollContainerRef}
          />
        ))}
      </div>
    </div>
  );
});
