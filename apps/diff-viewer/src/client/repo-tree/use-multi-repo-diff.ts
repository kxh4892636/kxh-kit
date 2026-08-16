// 多仓库 diff 聚合 (issue 04): 缓存各勾选仓库最近一次抓取的 diff 供文件树分组聚合,
// 按仓库记忆用户手选对比 (聚焦切换时恢复; 服务端会话同样保持, 双保险),
// 并承载跨仓库文件点击的 pendingScroll 效果。聚焦仓库的 diff 与 focusedRepoPath
// 仍由 App 持有 —— 主视图单仓库展示, 既有 diff 管道不变。
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { DiffResponse, DiffSelection } from "../../types/diff";
import type { RepositoryNode } from "../../types/repository";
import { createDiffSelection } from "../../utils/diffSelection";
import type { RepoFileGroup } from "../components/FileList";

interface UseMultiRepoDiffOptions {
  // 聚焦仓库当前展示的 diff (主视图数据源)
  diffData: DiffResponse | null;
  focusedRepoPath: string | null;
  // 按勾选先后顺序排列 (文件树分组顺序 = 勾选顺序)
  checkedPaths: string[];
  repositories: RepositoryNode[];
  scrollFileIntoDiffContainer: (filePath: string) => void;
}

export interface MultiRepoDiffState {
  // 用户手选对比按仓库记忆 (聚焦切换时恢复)
  selectionByRepoRef: RefObject<Map<string, DiffSelection>>;
  userSelectedReposRef: RefObject<Set<string>>;
  // 跨仓库文件点击: 等目标仓库成为聚焦仓库且 diff 数据就绪后再滚动定位
  pendingScrollFileRef: RefObject<string | null>;
  fileTreeGroups: RepoFileGroup[];
  // 按仓库缓存最近一次抓取的 diff, 并从响应回填该仓库的当前对比记忆
  recordRepoDiff: (repoPath: string, data: DiffResponse) => void;
}

export const useMultiRepoDiff = (options: UseMultiRepoDiffOptions): MultiRepoDiffState => {
  const { diffData, focusedRepoPath, checkedPaths, repositories, scrollFileIntoDiffContainer } =
    options;
  const [diffByRepo, setDiffByRepo] = useState<ReadonlyMap<string, DiffResponse>>(new Map());
  const selectionByRepoRef = useRef(new Map<string, DiffSelection>());
  const userSelectedReposRef = useRef(new Set<string>());
  const pendingScrollFileRef = useRef<string | null>(null);

  const recordRepoDiff = useCallback((repoPath: string, data: DiffResponse): void => {
    setDiffByRepo((prev) => new Map(prev).set(repoPath, data));
    const responseBase = data.requestedBaseCommitish ?? data.baseCommitish;
    const responseTarget = data.requestedTargetCommitish ?? data.targetCommitish;
    if (responseBase && responseTarget) {
      selectionByRepoRef.current.set(
        repoPath,
        createDiffSelection(responseBase, responseTarget, data.requestedBaseMode),
      );
    }
  }, []);

  // 跨仓库聚焦切换完成后, 滚动到触发切换的文件
  useEffect(() => {
    const pendingFile = pendingScrollFileRef.current;
    if (!pendingFile || !focusedRepoPath || !diffData) {
      return;
    }
    // diffData 必须是聚焦仓库刚抓取的版本 (引用相等), 否则还在用旧仓库数据
    if (diffByRepo.get(focusedRepoPath) !== diffData) {
      return;
    }
    if (!diffData.files.some((file) => file.path === pendingFile)) {
      return;
    }
    pendingScrollFileRef.current = null;
    // 等文件容器挂载; lazy 渲染由 scrollFileIntoDiffContainer 内部 ensure 处理
    const timer = setTimeout(() => scrollFileIntoDiffContainer(pendingFile), 100);
    return () => clearTimeout(timer);
  }, [focusedRepoPath, diffData, diffByRepo, scrollFileIntoDiffContainer]);

  const repoNameByPath = useMemo(() => {
    const map = new Map<string, string>();
    const visit = (nodes: RepositoryNode[]): void => {
      nodes.forEach((node) => {
        map.set(node.path, node.name);
        visit(node.children);
      });
    };
    visit(repositories);
    return map;
  }, [repositories]);

  // 文件树数据源: 勾选顺序即分组顺序; diff 尚未抓到的仓库 (激活进行中) 暂不出现
  const fileTreeGroups = useMemo<RepoFileGroup[]>(() => {
    const groups: RepoFileGroup[] = [];
    checkedPaths.forEach((repoPath) => {
      const data = diffByRepo.get(repoPath);
      if (!data) {
        return;
      }
      groups.push({
        repoPath,
        repoName: repoNameByPath.get(repoPath) ?? repoPath.split(/[\\/]/).pop() ?? repoPath,
        files: data.files,
        isFocused: repoPath === focusedRepoPath,
      });
    });
    // 回退平铺: 无可用分组时 (无 bridge 的纯浏览器 dev / 启动扫描完成前 / 取消全部
    // 勾选后保持视图) 以当前 diffData 平铺, 保持 03 之前的单仓库树外观
    if (groups.length === 0 && diffData) {
      groups.push({ repoPath: "", repoName: "", files: diffData.files, isFocused: true });
    }
    return groups;
  }, [checkedPaths, diffByRepo, repoNameByPath, focusedRepoPath, diffData]);

  return {
    selectionByRepoRef,
    userSelectedReposRef,
    pendingScrollFileRef,
    fileTreeGroups,
    recordRepoDiff,
  };
};
