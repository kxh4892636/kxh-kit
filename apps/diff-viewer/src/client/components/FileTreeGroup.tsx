// fork 改动 (client 第 5 处, issue 04): 文件树的单仓库分组渲染 —— 从 FileList.tsx
// 拆出 (文件行数门禁), 承载目录树构建/折叠/sticky 目录头/递归行渲染与分组头。
// 目录折叠集合以 仓库:路径 为键 (集合由 FileList 持有, 避免跨仓库同名目录互相折叠);
// reviewed/评论徽标仅聚焦组渲染 (其数据来自主视图当前仓库的对比, 非聚焦组展示会串仓库)。
import {
  ChevronRight,
  ChevronDown,
  FileDiff,
  FolderOpen,
  Folder,
  FilePlus,
  FileX,
  FilePen,
  MessageSquare,
  GitBranch,
} from "lucide-react";
import { memo, useMemo, useRef, type MouseEvent, type RefObject } from "react";

import { type DiffFile } from "../../types/diff";
import { isSafariBrowser } from "../utils/browser";

import { Checkbox } from "./Checkbox";
import type { RepoFileGroup } from "./FileList";

export interface TreeNode {
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

export function getAllDirectoryPaths(node: TreeNode): string[] {
  if (!node.isDirectory || !node.children) return [];
  const paths: string[] = [];
  if (node.path) paths.push(node.path);
  node.children.forEach((child) => {
    paths.push(...getAllDirectoryPaths(child));
  });
  return paths;
}

export function getReviewedDirectoryPaths(node: TreeNode, reviewedFiles: Set<string>): Set<string> {
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

export function buildFileTree(files: DiffFile[]): TreeNode {
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

// 分组渲染所需的派生视图, 全部由 FileList 统一计算 (跨分组共享同一份)
interface FileTreeGroupView {
  collapsedDirs: Set<string>;
  reviewedFiles: Set<string>;
  reviewedDirectoryPaths: Set<string>;
  commentCountMap: Map<string, number>;
  fileIndexMap: Map<string, number>;
  selectedFileIndex: number | null;
}

interface FileTreeGroupCallbacks {
  onSelectFile: (repoPath: string, filePath: string) => void;
  onFileSelected?: () => void;
  onToggleReviewed: (path: string) => void;
  onToggleFolderReviewed: (path: string, reviewed: boolean) => void;
  onToggleDirectory: (nodeKey: string) => void;
}

interface FileTreeGroupProps {
  group: RepoFileGroup;
  tree: TreeNode;
  view: FileTreeGroupView;
  callbacks: FileTreeGroupCallbacks;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

export const FileTreeGroup = memo(function FileTreeGroup({
  group,
  tree,
  view,
  callbacks,
  scrollContainerRef,
}: FileTreeGroupProps) {
  const {
    collapsedDirs,
    reviewedFiles,
    reviewedDirectoryPaths,
    commentCountMap,
    fileIndexMap,
    selectedFileIndex,
  } = view;
  const {
    onSelectFile,
    onFileSelected,
    onToggleReviewed,
    onToggleFolderReviewed,
    onToggleDirectory,
  } = callbacks;
  const shouldUseStickyDirectoryHeaders = useMemo(
    () => !isSafariBrowser(typeof navigator === "undefined" ? "" : navigator.userAgent),
    [],
  );
  const dirContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleDirectoryClick = (event: MouseEvent<HTMLDivElement>, nodeKey: string) => {
    if (!shouldUseStickyDirectoryHeaders) {
      onToggleDirectory(nodeKey);
      return;
    }

    const container = scrollContainerRef.current;
    const row = event.currentTarget;

    if (!container) {
      onToggleDirectory(nodeKey);
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
        onToggleDirectory(nodeKey);
        return;
      }

      container.scrollTo({ top: targetScrollTop });
      return;
    }

    onToggleDirectory(nodeKey);
  };

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

  const renderTreeNode = (node: TreeNode, depth: number): React.ReactNode => {
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
            node.children.map((child) => renderTreeNode(child, node.name ? depth + 1 : depth))}
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

  // 无仓库身份的回退平铺模式: 不渲染分组头, 目录/文件从 depth 0 开始
  if (!group.repoName) {
    return <div>{tree.children?.map((child) => renderTreeNode(child, 0))}</div>;
  }

  return (
    <div data-testid={`file-tree-repo-${group.repoName}`}>
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
      {tree.children?.map((child) => renderTreeNode(child, 1))}
    </div>
  );
});
