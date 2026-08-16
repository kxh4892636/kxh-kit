// 仓库扫描状态机 (issue 03): 挂载后扫描启动目录, 打开新目录后重扫;
// 勾选状态按先后顺序维护, 勾选/回退激活仓库经宿主的 onActivateRepository
// 落到主进程 (POST /api/active-repository) 切换单仓库 diff。
import { useCallback, useEffect, useRef, useState } from "react";

import type { RepositoryNode, ScanProgress } from "../../types/repository";

export interface RepositoryScanState {
  workspaceRoot: string | null;
  repositories: RepositoryNode[];
  scanning: boolean;
  progress: ScanProgress | null;
  error: string | null;
  // 按勾选先后顺序排列, 取消勾选即移除
  checkedPaths: string[];
  activePath: string | null;
  openFolder: () => Promise<void>;
  toggleRepository: (path: string) => void;
}

interface UseRepositoryScanOptions {
  // 宿主 (App) 负责切换激活仓库并重取 diff/revisions; 返回是否成功
  onActivateRepository: (repoPath: string) => Promise<boolean>;
}

export const useRepositoryScan = (options: UseRepositoryScanOptions): RepositoryScanState => {
  const { onActivateRepository } = options;
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<RepositoryNode[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedPaths, setCheckedPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

  // 并发防护: 只认最后一次发起的扫描 (启动扫描与打开新目录可能交叠);
  // scanId 同时用于丢弃过期扫描的进度事件
  const scanSeqRef = useRef(0);
  const activePathRef = useRef<string | null>(null);
  activePathRef.current = activePath;
  const checkedPathsRef = useRef<string[]>([]);
  checkedPathsRef.current = checkedPaths;
  const unsubscribeProgressRef = useRef<(() => void) | null>(null);

  const activate = useCallback(
    async (repoPath: string): Promise<void> => {
      const succeeded = await onActivateRepository(repoPath);
      if (succeeded) {
        setActivePath(repoPath);
        setError(null);
      } else {
        setError(`Failed to open repository: ${repoPath}`);
      }
    },
    [onActivateRepository],
  );

  const startScan = useCallback(
    async (rootPath: string): Promise<void> => {
      const bridge = window.diffViewerBridge;
      if (!bridge) {
        return;
      }

      const scanId = `scan-${(scanSeqRef.current += 1)}`;
      const sequence = scanSeqRef.current;
      setScanning(true);
      setProgress(null);
      setError(null);

      unsubscribeProgressRef.current?.();
      unsubscribeProgressRef.current = bridge.onScanProgress((eventScanId, eventProgress) => {
        if (eventScanId === scanId) {
          setProgress(eventProgress);
        }
      });

      try {
        const result = await bridge.scanRepositories(scanId, rootPath);
        if (scanSeqRef.current !== sequence) {
          return;
        }
        setWorkspaceRoot(result.rootPath);
        setRepositories(result.repositories);
        // 扫描根本身是仓库时自动勾选; 与当前激活仓库不同 (打开新目录) 则顺带切换
        const rootRepo = result.repositories.find((node) => node.path === result.rootPath);
        if (rootRepo) {
          setCheckedPaths((previous) =>
            previous.includes(rootRepo.path) ? previous : [rootRepo.path, ...previous],
          );
          if (activePathRef.current !== rootRepo.path) {
            await activate(rootRepo.path);
          }
        }
      } catch (scanError) {
        console.error("Repository scan failed:", scanError);
        if (scanSeqRef.current === sequence) {
          setRepositories([]);
          setError(scanError instanceof Error ? scanError.message : "Repository scan failed");
        }
      } finally {
        unsubscribeProgressRef.current?.();
        unsubscribeProgressRef.current = null;
        if (scanSeqRef.current === sequence) {
          setScanning(false);
          setProgress(null);
        }
      }
    },
    [activate],
  );

  // 启动: 激活仓库 = 启动目录 (主进程 parser 即以此为根), 先记录再扫描
  useEffect(() => {
    const bridge = window.diffViewerBridge;
    if (!bridge) {
      return;
    }

    let cancelled = false;
    bridge
      .getWorkspace()
      .then(({ rootPath }) => {
        if (cancelled) {
          return;
        }
        // ref 需同步赋值: 紧随的 startScan 在同一事件循环里读 ref 判断是否重复激活
        activePathRef.current = rootPath;
        setWorkspaceRoot(rootPath);
        setActivePath(rootPath);
        void startScan(rootPath);
      })
      .catch((workspaceError: unknown) => {
        console.error("Failed to resolve workspace:", workspaceError);
        if (!cancelled) {
          setError("Failed to resolve workspace");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [startScan]);

  // 卸载时退订进度事件, 避免悬挂监听
  useEffect(
    () => () => {
      unsubscribeProgressRef.current?.();
    },
    [],
  );

  const openFolder = useCallback(async (): Promise<void> => {
    const bridge = window.diffViewerBridge;
    if (!bridge) {
      return;
    }

    let selected: string | null;
    try {
      selected = await bridge.pickDirectory();
    } catch (dialogError) {
      console.error("Failed to open directory picker:", dialogError);
      setError("Failed to open directory picker");
      return;
    }
    if (selected === null) {
      return;
    }

    // 新目录 = 新工作上下文, 勾选状态不跨目录保留
    setCheckedPaths([]);
    await startScan(selected);
  }, [startScan]);

  const toggleRepository = useCallback(
    (repoPath: string): void => {
      const isChecked = checkedPathsRef.current.includes(repoPath);
      if (!isChecked) {
        setCheckedPaths((previous) => [...previous, repoPath]);
        void activate(repoPath);
        return;
      }

      const remaining = checkedPathsRef.current.filter((path) => path !== repoPath);
      setCheckedPaths(remaining);
      // 取消勾选的恰是当前激活仓库时, 回退到最近一个仍勾选的仓库;
      // 无剩余勾选则维持当前 diff 不动 (多仓库同视图为 04 的范围)
      if (activePathRef.current === repoPath && remaining.length > 0) {
        void activate(remaining[remaining.length - 1] as string);
      }
    },
    [activate],
  );

  return {
    workspaceRoot,
    repositories,
    scanning,
    progress,
    error,
    checkedPaths,
    activePath,
    openFolder,
    toggleRepository,
  };
};
