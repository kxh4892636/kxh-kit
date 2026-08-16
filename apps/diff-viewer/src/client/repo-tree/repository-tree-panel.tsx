// issue 03 侧栏仓库树面板: 打开目录 → 异步扫描嵌套仓库 (进度可见) →
// 父子层级展示并勾选。勾选经宿主的 onActivateRepository 切换激活仓库,
// 单仓库 diff 管道 (01/02) 承接展示; 多仓库同视图归 04。
import { FolderOpen, Loader2 } from "lucide-react";

import type { RepositoryNode } from "../../types/repository";
import { Checkbox } from "../components/Checkbox";

import { useRepositoryScan } from "./use-repository-scan";

interface RepositoryTreePanelProps {
  onActivateRepository: (repoPath: string) => Promise<boolean>;
}

interface RepositoryTreeNodeProps {
  node: RepositoryNode;
  depth: number;
  checkedPaths: string[];
  activePath: string | null;
  onToggle: (repoPath: string) => void;
}

const RepositoryTreeNode: React.FC<RepositoryTreeNodeProps> = (props) => {
  const { node, depth, checkedPaths, activePath, onToggle } = props;
  const checked = checkedPaths.includes(node.path);
  const isActive = activePath === node.path;

  return (
    <li data-testid={`repo-node-${node.name}`}>
      <div
        data-testid={`repo-row-${node.name}`}
        data-active={isActive ? "true" : "false"}
        className={`flex items-center gap-1.5 py-1 pr-3 ${
          isActive ? "text-github-text-primary" : "text-github-text-secondary"
        }`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
      >
        <Checkbox
          checked={checked}
          onChange={() => onToggle(node.path)}
          title={checked ? `Remove ${node.name} from view` : `Add ${node.name} to view`}
        />
        <span className={`truncate text-xs ${isActive ? "font-medium" : ""}`} title={node.path}>
          {node.name}
          {node.isSubmodule ? " (submodule)" : ""}
        </span>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <RepositoryTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              checkedPaths={checkedPaths}
              activePath={activePath}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export const RepositoryTreePanel: React.FC<RepositoryTreePanelProps> = (props) => {
  const { onActivateRepository } = props;
  const {
    repositories,
    scanning,
    progress,
    error,
    checkedPaths,
    activePath,
    openFolder,
    toggleRepository,
  } = useRepositoryScan({ onActivateRepository });

  // 纯浏览器 dev / 单测无 bridge 时降级, 不影响其余 UI
  if (typeof window === "undefined" || !window.diffViewerBridge) {
    return (
      <div
        data-testid="repository-tree-unavailable"
        className="px-3 py-2 text-xs text-github-text-muted border-b border-github-border"
      >
        Repository scan requires the desktop app
      </div>
    );
  }

  return (
    <section
      data-testid="repository-tree-panel"
      className="border-b border-github-border flex flex-col"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-github-text-muted">
          Repositories
        </span>
        <button
          type="button"
          data-testid="open-folder-button"
          onClick={() => void openFolder()}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded text-github-text-secondary hover:text-github-text-primary hover:bg-github-bg-tertiary transition-colors"
          title="Open a folder and scan its repositories"
        >
          <FolderOpen size={14} />
          Open Folder
        </button>
      </div>
      {scanning && (
        <div
          data-testid="scan-progress"
          className="flex items-center gap-1.5 px-3 pb-2 text-xs text-github-text-secondary"
        >
          <Loader2 size={12} className="animate-spin" />
          <span>
            Scanning…
            {progress !== null &&
              ` ${progress.scannedDirectories} dirs, ${progress.foundRepositories} repos found`}
          </span>
        </div>
      )}
      {error !== null && (
        <div data-testid="repository-tree-error" className="px-3 pb-2 text-xs text-github-danger">
          {error}
        </div>
      )}
      {!scanning && error === null && repositories.length === 0 && (
        <div className="px-3 pb-2 text-xs text-github-text-muted">No repositories found</div>
      )}
      <ul data-testid="repository-tree" className="pb-1">
        {repositories.map((node) => (
          <RepositoryTreeNode
            key={node.path}
            node={node}
            depth={0}
            checkedPaths={checkedPaths}
            activePath={activePath}
            onToggle={toggleRepository}
          />
        ))}
      </ul>
    </section>
  );
};
