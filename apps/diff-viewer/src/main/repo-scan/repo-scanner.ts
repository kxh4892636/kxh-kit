// 嵌套仓库扫描器 (issue 03): 递归发现目录下的所有 git 仓库。
// 规则: 目录含 .git (目录或 gitfile 文件) 即记为仓库条目, 并继续向其内部递归
// (仓中仓为父子条目; submodule 的 .git 文件形式同样识别); 默认跳过
// node_modules/dist 等重型目录, 且不进入任何 .git 内部; 深度上限默认 8。
// 扫描为按名称排序的顺序遍历 (结果与进度序列确定, 便于测试与 UI 展示),
// 每扫描完一个目录发出一次进度事件; 回调可返回 Promise, 供调用方节流或注入延迟。
import { promises as fs } from "fs";
import type { Dirent } from "fs";
import { basename, join, resolve } from "path";

import type { RepositoryNode, RepositoryScanResult, ScanProgress } from "../../types/repository.js";

export const DEFAULT_MAX_DEPTH = 8;

// 默认跳过的重型目录名; .git 内部由扫描逻辑按名特例跳过, 不在此列
export const DEFAULT_SKIP_DIRECTORY_NAMES: readonly string[] = [
  "node_modules",
  "dist",
  "out",
  "build",
  "coverage",
  "target",
  ".next",
  ".nuxt",
  ".turbo",
];

export interface RepoScanOptions {
  maxDepth?: number;
  skipDirectoryNames?: readonly string[];
}

export type ScanProgressCallback = (progress: ScanProgress) => void | Promise<void>;

// 扫描到的仓库平铺条目, parentPath 为最近的祖先仓库路径 (无则顶层);
// 树形结构由 buildRepositoryTree 还原
interface ScannedRepository {
  path: string;
  name: string;
  isSubmodule: boolean;
  parentPath: string | null;
}

// 平铺条目按扫描发现顺序还原父子层级 (发现顺序即同层展示顺序)
export const buildRepositoryTree = (scanned: ScannedRepository[]): RepositoryNode[] => {
  const nodes = new Map<string, RepositoryNode>();
  const topLevel: RepositoryNode[] = [];

  for (const entry of scanned) {
    const node: RepositoryNode = {
      path: entry.path,
      name: entry.name,
      isSubmodule: entry.isSubmodule,
      children: [],
    };
    nodes.set(entry.path, node);

    const parent = entry.parentPath === null ? undefined : nodes.get(entry.parentPath);
    if (parent) {
      parent.children.push(node);
    } else {
      topLevel.push(node);
    }
  }

  return topLevel;
};

export const scanForRepositories = async (
  rootPath: string,
  options: RepoScanOptions = {},
  onProgress?: ScanProgressCallback,
): Promise<RepositoryScanResult> => {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const skipNames = new Set(options.skipDirectoryNames ?? DEFAULT_SKIP_DIRECTORY_NAMES);
  const resolvedRoot = resolve(rootPath);

  const scanned: ScannedRepository[] = [];
  let scannedDirectories = 0;

  const readDirectoryEntries = async (directoryPath: string): Promise<Dirent[]> => {
    try {
      return await fs.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      // 权限不足/目录被并发删除等单目录失败不中断整体扫描, 记日志后按空目录处理
      console.error(`Failed to read directory during repository scan: ${directoryPath}:`, error);
      return [];
    }
  };

  const scanDirectory = async (
    directoryPath: string,
    depth: number,
    nearestRepoPath: string | null,
  ): Promise<void> => {
    const entries = await readDirectoryEntries(directoryPath);
    scannedDirectories += 1;

    const gitEntry = entries.find((entry) => entry.name === ".git");
    let currentRepoPath = nearestRepoPath;
    if (gitEntry !== undefined) {
      scanned.push({
        path: directoryPath,
        name: basename(directoryPath),
        isSubmodule: gitEntry.isFile(),
        parentPath: nearestRepoPath,
      });
      currentRepoPath = directoryPath;
    }

    await onProgress?.({
      scannedDirectories,
      foundRepositories: scanned.length,
      currentDirectory: directoryPath,
    });

    if (depth >= maxDepth) {
      return;
    }

    const childDirectories = entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => entry.name !== ".git" && !skipNames.has(entry.name))
      .map((entry) => entry.name)
      .sort();

    for (const childName of childDirectories) {
      await scanDirectory(join(directoryPath, childName), depth + 1, currentRepoPath);
    }
  };

  await scanDirectory(resolvedRoot, 0, null);

  return {
    rootPath: resolvedRoot,
    repositories: buildRepositoryTree(scanned),
    scannedDirectories,
  };
};
