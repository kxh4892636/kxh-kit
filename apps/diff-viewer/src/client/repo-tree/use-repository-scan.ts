// 仓库扫描状态机 (issue 03/04): 挂载后扫描启动目录, 打开新目录后重扫;
// 勾选状态按先后顺序维护。04 起该 hook 由 App 直接调用 (勾选状态需跨层消费:
// 文件树聚合各勾选仓库的变更文件), 面板组件纯渲染。
// 勾选/回退/跨仓库文件点击聚焦都经宿主的 onActivateRepository 落到主进程
// (POST /api/active-repository, 04 起为幂等激活, 不再丢弃其他仓库会话)。
// issue 06: openRemote 经 bridge.connectSsh 连接 SSH 远程并整体替换工作上下文
// (语义同 openFolder 换目录: 勾选不跨上下文保留, 在途扫描被失效)。
// issue 01(阅读体验优化): 宿主回调经 ref 消费 —— App 的 onActivateRepository 身份随
// 无关状态 (ignoreWhitespace) 变化, 若进依赖链会逐级重建 activate/applyScanResult/
// startScan 并重启启动扫描 (重扫/聚焦重置/远程树被本地扫描结果替换)。
import { useCallback, useEffect, useRef, useState } from "react";

import type { RepositoryNode, RepositoryScanResult, ScanProgress } from "../../types/repository";

export interface RepositoryScanState {
  workspaceRoot: string | null;
  repositories: RepositoryNode[];
  scanning: boolean;
  progress: ScanProgress | null;
  error: string | null;
  // 按勾选先后顺序排列, 取消勾选即移除
  checkedPaths: string[];
  // 聚焦仓库 (主视图当前展示 diff 的仓库)
  activePath: string | null;
  openFolder: () => Promise<void>;
  toggleRepository: (path: string) => void;
  // 不改变勾选状态, 仅聚焦指定仓库 (文件树跨仓库文件点击);
  // 返回激活是否成功
  activateRepository: (repoPath: string) => Promise<boolean>;
  // issue 06: 连接 SSH 远程并以扫描结果替换当前工作上下文; 返回连接是否成功
  openRemote: (target: string, remotePath: string) => Promise<boolean>;
}

interface UseRepositoryScanOptions {
  // 宿主 (App) 负责激活仓库并重取 diff/revisions; 返回是否成功
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
  // 最新宿主回调: activate 经 ref 消费, 保持身份稳定 (见文件头 issue 01 注)
  const onActivateRepositoryRef = useRef(onActivateRepository);
  onActivateRepositoryRef.current = onActivateRepository;

  const activate = useCallback(async (repoPath: string): Promise<boolean> => {
    const succeeded = await onActivateRepositoryRef.current(repoPath);
    if (succeeded) {
      setActivePath(repoPath);
      setError(null);
    } else {
      setError(`Failed to open repository: ${repoPath}`);
    }
    return succeeded;
  }, []);

  // 扫描成功的落态 (本地扫描与远程连接共用): 扫描根本身是仓库时自动勾选并激活。
  // 04 起不再跳过"已是聚焦仓库"的激活: 激活经 POST /api/active-repository 是幂等的
  // (会话对比不重置), 且能让 App 记录 focusedRepoPath 并把该仓库 diff 纳入
  // 文件树分组的数据源
  const applyScanResult = useCallback(
    async (result: RepositoryScanResult): Promise<void> => {
      setWorkspaceRoot(result.rootPath);
      setRepositories(result.repositories);
      const rootRepo = result.repositories.find((node) => node.path === result.rootPath);
      if (rootRepo) {
        setCheckedPaths((previous) =>
          previous.includes(rootRepo.path) ? previous : [rootRepo.path, ...previous],
        );
        await activate(rootRepo.path);
      }
    },
    [activate],
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
        await applyScanResult(result);
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
    [applyScanResult],
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

  // issue 06: 连接 SSH 远程 = 新工作上下文。远程扫描在一次 IPC 内完成, 无进度事件
  const openRemote = useCallback(
    async (target: string, remotePath: string): Promise<boolean> => {
      const bridge = window.diffViewerBridge;
      if (!bridge) {
        return false;
      }

      // 占用新序列号使在途扫描失效; 退订本地扫描的进度监听
      const sequence = (scanSeqRef.current += 1);
      unsubscribeProgressRef.current?.();
      unsubscribeProgressRef.current = null;
      setScanning(true);
      setProgress(null);
      setError(null);

      try {
        const result = await bridge.connectSsh({ target, path: remotePath });
        if (scanSeqRef.current !== sequence) {
          return false;
        }
        // 连接成功才切换工作上下文: 勾选状态不跨上下文保留, 失败时保持现状
        setCheckedPaths([]);
        await applyScanResult(result);
        return true;
      } catch (connectError) {
        console.error("SSH connect failed:", connectError);
        if (scanSeqRef.current === sequence) {
          setError(connectError instanceof Error ? connectError.message : "SSH connect failed");
        }
        return false;
      } finally {
        if (scanSeqRef.current === sequence) {
          setScanning(false);
        }
      }
    },
    [applyScanResult],
  );

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
      // 取消勾选的恰是当前聚焦仓库时, 回退到最近一个仍勾选的仓库;
      // 无剩余勾选则保持当前聚焦与 diff 视图 (04 取舍: 不清空视图,
      // 避免误操作勾选导致内容消失; 文件树由 App 按勾选状态自然收敛)
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
    activateRepository: activate,
    openRemote,
  };
};
