// fork 改动 (client 第 5 处): issue 04 多仓库文件树 —— props 从单仓库
// files: DiffFile[] 改为 groups: RepoFileGroup[] (顶层按仓库分组, 聚合各勾选仓库
// 激活对比的变更文件); onScrollToFile 改为 onSelectFile(repoPath, filePath)
// (点击非聚焦仓库文件由宿主切换聚焦后再滚动); reviewed/评论设施仅渲染聚焦仓库分组
// (其数据来自主视图当前仓库的对比, 非聚焦分组展示会串仓库)。
// 其余 fork 改动清单见 main.tsx / useHighlightedCode.ts / ImageDiffViewer.tsx /
// App.tsx / DiffQuickMenu.tsx 文件头注释。
import {
  ChevronRight,
  ChevronDown,
  FileDiff,
  FolderOpen,
  Folder,
  FilePlus,
  FileX,
  FilePen,
  Search,
  MessageSquare,
  ChevronsDownUp,
  ChevronsUpDown,
  GitBranch,
} from "lucide-react";
import { memo, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";

import { type DiffFile, type CommentThread } from "../../types/diff";
import { isSafariBrowser } from "../utils/browser";

import { Checkbox } from "./Checkbox";

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

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
  file?: DiffFile;
}

const TREE_ROW_PADDING_LEFT_PX = 16;
const TREE_ICON_SIZE_PX = 16;
const TREE_ROW_GAP_PX = 8;
const TREE_INDENT_STEP_PX = TREE_ICON_SIZE_PX + TREE_ROW_GAP_PX;

function getTreeRowPaddingLeft(depth: number): string {
  return `${depth * TREE_INDENT_STEP_PX + TREE_ROW_PADDING_LEFT_PX}px`;
}

function getAllDirectoryPaths(node: TreeNode): string[] {
  if (!node.isDirectory || !node.children) return [];
  const paths: string[] = [];
  if (node.path) paths.push(node.path);
  node.children.forEach((child) => {
    paths.push(...getAllDirectoryPaths(child));
  });
  return paths;
}

function getReviewedDirectoryPaths(node: TreeNode, reviewedFiles: Set<string>): Set<string> {
  const reviewedDirectoryPaths = new Set<string>();

  const visit = (currentNode: TreeNode): boolean => {
    if (currentNode.file) {
      return reviewedFiles.has(currentNode.file.path);
    }

    if (!currentNode.isDirectory || !currentNode.children || currentNode.children.length === 0) {
      return false;
    }

    const childrenReviewed = currentNode.children.map((child) => visit(child));
    const areAllChildrenReviewed = childrenReviewed.every(Boolean);
    if (areAllChildrenReviewed && currentNode.path) {
      reviewedDirectoryPaths.add(currentNode.path);
    }
    return areAllChildrenReviewed;
  };

  visit(node);
  return reviewedDirectoryPaths;
}

function buildFileTree(files: DiffFile[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    isDirectory: true,
    children: [],
  };

  files.forEach((file) => {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const isLast = i === parts.length - 1;
      const pathSoFar = parts.slice(0, i + 1).join("/");

      if (!current.children) {
        current.children = [];
      }

      let child = current.children.find((c) => c.name === part && c.isDirectory === !isLast);

      if (!child) {
        child = {
          name: part,
          path: pathSoFar,
          isDirectory: !isLast,
          children: isLast ? undefined : [],
          file: isLast ? file : undefined,
        };
        current.children.push(child);
      }

      current = child;
    }
  });

  // Collapse single child directories
  const collapseDirectories = (node: TreeNode): TreeNode => {
    if (!node.isDirectory || !node.children) {
      return node;
    }

    // First, recursively collapse children
    node.children = node.children.map(collapseDirectories);

    // If this directory has only one child directory (no files), collapse them
    if (node.children.length === 1 && node.children[0]?.isDirectory && node.children[0]?.children) {
      const child = node.children[0];
      if (child) {
        // Don't collapse the root node - keep the full path structure
        if (!node.name) {
          return node;
        }
        return {
          ...node,
          name: `${node.name}/${child.name}`,
          path: child.path,
          children: child.children,
        };
      }
    }

    return node;
  };

  return collapseDirectories(root);
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
  const shouldUseStickyDirectoryHeaders = useMemo(
    () => !isSafariBrowser(typeof navigator === "undefined" ? "" : navigator.userAgent),
    [],
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dirContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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

  const getFileIcon = (status: DiffFile["status"]) => {
    switch (status) {
      case "added":
        return <FilePlus size={16} className="text-github-accent" />;
      case "deleted":
        return <FileX size={16} className="text-github-danger" />;
      case "renamed":
        return <FilePen size={16} className="text-github-warning" />;
      default:
        return <FileDiff size={16} className="text-github-text-secondary" />;
    }
  };

  const toggleDirectory = (path: string) => {
    setCollapsedDirs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

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

  const handleDirectoryClick = (event: MouseEvent<HTMLDivElement>, nodeKey: string) => {
    if (!shouldUseStickyDirectoryHeaders) {
      toggleDirectory(nodeKey);
      return;
    }

    const container = scrollContainerRef.current;
    const row = event.currentTarget;

    if (!container) {
      toggleDirectory(nodeKey);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const topOffset = Number.parseFloat(getComputedStyle(row).top || "0");
    const relativeTop = rowRect.top - containerRect.top;
    const isSticky = relativeTop <= topOffset + 1;

    if (isSticky) {
      const wrapper = dirContainerRefs.current.get(nodeKey);
      const firstChild = wrapper?.querySelector<HTMLElement>(
        '[data-tree-row="true"]:not([data-dir-header="true"])',
      );
      const rowHeight = row.getBoundingClientRect().height || 0;
      const target = firstChild ?? row;
      const depthValue = Number.parseInt(target.dataset.depth || row.dataset.depth || "0", 10);
      const stackedOffset = rowHeight * depthValue;
      const targetScrollTop = Math.max(0, target.offsetTop - stackedOffset);

      if (Math.abs(container.scrollTop - targetScrollTop) <= 1) {
        toggleDirectory(nodeKey);
        return;
      }

      container.scrollTo({ top: targetScrollTop });
      return;
    }

    toggleDirectory(nodeKey);
  };

  const renderTreeNode = (node: TreeNode, depth: number, group: RepoFileGroup): React.ReactNode => {
    // 目录折叠集合以 仓库:路径 为键, 避免跨仓库同名目录互相折叠
    const nodeKey = `${group.repoPath}:${node.path}`;
    if (node.isDirectory && node.children) {
      const isExpanded = !collapsedDirs.has(nodeKey);
      const isReviewed = group.isFocused && reviewedDirectoryPaths.has(node.path);

      return (
        <div
          key={nodeKey}
          data-dir-container={node.path || undefined}
          ref={(el) => {
            if (!node.path) return;
            if (el) {
              dirContainerRefs.current.set(nodeKey, el);
            } else {
              dirContainerRefs.current.delete(nodeKey);
            }
          }}
        >
          {node.name && (
            <div
              className={`${shouldUseStickyDirectoryHeaders ? "sticky " : ""}group flex h-9 items-center gap-2 bg-github-bg-secondary px-4 hover:bg-github-bg-tertiary cursor-pointer ${
                isReviewed ? "opacity-70" : ""
              }`}
              data-dir-header="true"
              data-tree-row="true"
              data-depth={depth}
              style={{
                paddingLeft: getTreeRowPaddingLeft(depth),
                top: shouldUseStickyDirectoryHeaders
                  ? `calc(${depth} * var(--dir-row-height))`
                  : undefined,
                zIndex: shouldUseStickyDirectoryHeaders ? 1000 - depth : undefined,
              }}
              onClick={(event) => handleDirectoryClick(event, nodeKey)}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className="flex items-center group-hover:hidden">
                {isExpanded ? (
                  <FolderOpen size={16} className="text-github-text-secondary" />
                ) : (
                  <Folder size={16} className="text-github-text-secondary" />
                )}
              </span>
              {group.isFocused && (
                <span className="hidden items-center pl-[2px] group-hover:flex">
                  <Checkbox
                    checked={isReviewed}
                    onChange={() => {
                      onToggleFolderReviewed(node.path, !isReviewed);
                    }}
                    title={
                      isReviewed ? "Mark all files as not reviewed" : "Mark all files as reviewed"
                    }
                    className="z-10"
                  />
                </span>
              )}
              <span
                className={`text-sm text-github-text-primary font-medium flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${
                  isReviewed ? "line-through text-github-text-muted" : ""
                }`}
                title={node.name}
              >
                {node.name}
              </span>
            </div>
          )}
          {(isExpanded || !node.name) &&
            node.children.map((child) =>
              renderTreeNode(child, node.name ? depth + 1 : depth, group),
            )}
        </div>
      );
    } else if (node.file) {
      const file = node.file;
      const commentCount = group.isFocused ? (commentCountMap.get(file.path) ?? 0) : 0;
      const isReviewed = group.isFocused && reviewedFiles.has(file.path);
      const fileIndex = group.isFocused ? (fileIndexMap.get(file.path) ?? -1) : -1;
      const isSelected = selectedFileIndex !== null && selectedFileIndex === fileIndex;

      return (
        <div
          key={`file:${group.repoPath}:${file.path}`}
          className={`flex items-center gap-2 px-4 py-2 hover:bg-github-bg-tertiary cursor-pointer transition-colors ${
            isReviewed ? "opacity-70" : ""
          } ${isSelected ? "bg-github-bg-tertiary" : ""}`}
          data-file-row="true"
          data-tree-row="true"
          data-depth={depth}
          style={{ paddingLeft: getTreeRowPaddingLeft(depth) }}
          onClick={() => {
            onSelectFile(group.repoPath, file.path);
            onFileSelected?.();
          }}
        >
          {group.isFocused && (
            <Checkbox
              checked={isReviewed}
              onChange={() => {
                onToggleReviewed(file.path);
              }}
              title={isReviewed ? "Mark as not reviewed" : "Mark as reviewed"}
              className="z-10"
            />
          )}
          {getFileIcon(node.file.status)}
          <span
            className={`text-sm text-github-text-primary flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${
              isReviewed ? "line-through text-github-text-muted" : ""
            }`}
            title={node.file.path}
          >
            {node.name}
          </span>
          {commentCount > 0 && (
            <span
              data-testid={`comment-count-${file.path}`}
              className="text-github-warning text-sm font-medium ml-auto flex items-center gap-1"
            >
              <MessageSquare size={14} />
              {commentCount}
            </span>
          )}
        </div>
      );
    }

    return null;
  };

  const renderGroup = ({ group, tree }: { group: RepoFileGroup; tree: TreeNode }) => {
    // 无仓库身份的回退平铺模式: 不渲染分组头, 目录/文件从 depth 0 开始
    if (!group.repoName) {
      return (
        <div key={group.repoPath}>
          {tree.children?.map((child) => renderTreeNode(child, 0, group))}
        </div>
      );
    }

    return (
      <div key={group.repoPath} data-testid={`file-tree-repo-${group.repoName}`}>
        <div
          className="flex h-9 items-center gap-2 px-4 bg-github-bg-secondary"
          style={{ paddingLeft: getTreeRowPaddingLeft(0) }}
          title={group.repoPath}
        >
          <GitBranch size={16} className="text-github-text-secondary" />
          <span className="text-sm text-github-text-primary font-semibold flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {group.repoName}
          </span>
          <span className="text-xs text-github-text-muted">{group.files.length}</span>
        </div>
        {tree.children?.map((child) => renderTreeNode(child, 1, group))}
      </div>
    );
  };

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
        {filteredGroupTrees.map(renderGroup)}
      </div>
    </div>
  );
});
