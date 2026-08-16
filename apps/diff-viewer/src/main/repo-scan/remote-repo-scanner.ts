// 远程嵌套仓库扫描器 (issue 06): 经 ssh exec 在远端 POSIX shell 执行一次 find 脚本,
// 输出三节 (仓库 .git 目录 / .git gitfile / 已扫描目录计数), 本地解析为 03 的
// RepositoryScanResult 契约 (buildRepositoryTree 复用)。
// 远端假定: POSIX shell + find + git 在 PATH (spec 既定); 不进入 .git 内部与
// 重型目录 (与本地扫描器同名跳过表/深度上限)。
// 已知差异 (可接受): 路径含换行符的目录无法经换行分隔输出表达; .git 为符号链接时
// 归入目录节 (与本地 Dirent.isFile()=false 的行为一致)。
import type { CommandExecutor } from "../remote/executor.js";
import { shellQuote } from "../remote/ssh-target.js";
import type { RepositoryScanResult, ScanProgress } from "../../types/repository.js";

import {
  buildRepositoryTree,
  DEFAULT_MAX_DEPTH,
  DEFAULT_SKIP_DIRECTORY_NAMES,
  type ScannedRepository,
} from "./repo-scanner.js";

// 脚本首行标记: e2e 的 fake executor 凭此识别扫描脚本 (给出语义等价的本地实现)
export const SCAN_SCRIPT_MARKER = "# diff-viewer-scan-v1";

const SECTION_REPOS_DIR = "@@REPOS-DIR";
const SECTION_REPOS_FILE = "@@REPOS-FILE";
const SECTION_DIRS_COUNT = "@@DIRS-COUNT";

export interface RemoteRepoScanOptions {
  // 远端绝对 POSIX 路径 (调用前必须已过 validateRemotePath)
  remotePath: string;
  // 会话键前缀 (ssh://user@host[:port]); 节点 path = keyBase + 远端绝对路径
  keyBase: string;
  maxDepth?: number;
  skipDirectoryNames?: readonly string[];
}

export type RemoteScanProgressCallback = (progress: ScanProgress) => void;

// find 谓词: 跳过名 prune; .git 目录打印并 prune; .git 符号链接归入目录节 (见文件头);
// .git gitfile (submodule 检出形态) 单独一节以标记 isSubmodule
const buildScanScript = (options: RemoteRepoScanOptions): string => {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const skipNames = options.skipDirectoryNames ?? DEFAULT_SKIP_DIRECTORY_NAMES;
  const skipPredicate = skipNames.map((name) => `-name ${shellQuote(name)}`).join(" -o ");
  const root = shellQuote(options.remotePath);
  // 本地扫描器在深度 d (0 起, 上限 maxDepth) 的目录内发现 .git 条目,
  // 折成 find 深度即 maxDepth + 1; 目录计数语义与本地一致故仍 maxDepth
  const repoFindDepth = maxDepth + 1;

  return [
    // 标记行携带 shell 引号包裹的根路径: e2e 的 fake executor 凭标记识别脚本并还原根
    `${SCAN_SCRIPT_MARKER} ${root}`,
    `echo '${SECTION_REPOS_DIR}'`,
    `find ${root} -maxdepth ${repoFindDepth} \\( ${skipPredicate} \\) -prune -o -type d -name '.git' -print -prune -o -type l -name '.git' -print`,
    `echo '${SECTION_REPOS_FILE}'`,
    `find ${root} -maxdepth ${repoFindDepth} \\( ${skipPredicate} \\) -prune -o -type d -name '.git' -prune -o -type f -name '.git' -print`,
    `echo '${SECTION_DIRS_COUNT}'`,
    `find ${root} -maxdepth ${maxDepth} \\( ${skipPredicate} \\) -prune -o -type d -name '.git' -prune -o -type d -print | wc -l`,
  ].join("\n");
};

interface ParsedScanOutput {
  repoDirs: string[];
  repoFiles: string[];
  scannedDirectories: number;
}

const parseScanOutput = (stdout: string): ParsedScanOutput => {
  const lines = stdout.split("\n");
  const dirMark = lines.indexOf(SECTION_REPOS_DIR);
  const fileMark = lines.indexOf(SECTION_REPOS_FILE);
  const countMark = lines.indexOf(SECTION_DIRS_COUNT);
  if (
    dirMark === -1 ||
    fileMark === -1 ||
    countMark === -1 ||
    !(dirMark < fileMark && fileMark < countMark)
  ) {
    throw new Error("Unexpected remote scan output (missing section markers)");
  }

  const nonEmpty = (line: string): boolean => line.trim().length > 0;
  const repoDirs = lines.slice(dirMark + 1, fileMark).filter(nonEmpty);
  const repoFiles = lines.slice(fileMark + 1, countMark).filter(nonEmpty);
  const countText = lines.slice(countMark + 1).find(nonEmpty) ?? "";
  const scannedDirectories = Number.parseInt(countText.trim(), 10);

  return {
    repoDirs,
    repoFiles,
    scannedDirectories: Number.isFinite(scannedDirectories) ? scannedDirectories : 0,
  };
};

// `.git` 条目路径 → 仓库目录路径 (根目录 "/" 的 .git 为 "/.git")
const repoPathFromGitEntry = (gitEntryPath: string): string => {
  const stripped = gitEntryPath.replace(/\/?\.git$/, "");
  return stripped === "" ? "/" : stripped;
};

const remoteBasename = (remotePath: string): string => {
  const segment = remotePath.split("/").pop();
  // 根目录无 basename, 以路径本身兜底保证 UI 可展示
  return segment === undefined || segment === "" ? remotePath : segment;
};

export const scanRemoteRepositories = async (
  executor: CommandExecutor,
  options: RemoteRepoScanOptions,
  onProgress?: RemoteScanProgressCallback,
): Promise<RepositoryScanResult> => {
  const script = buildScanScript(options);
  const result = await executor.exec("sh", ["-c", script]);
  if (result.exitCode !== 0) {
    throw new Error(
      `Remote repository scan failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
    );
  }

  const parsed = parseScanOutput(result.stdout);

  // 远端绝对路径 → 平铺条目; 父条目必须排在子条目前 (buildRepositoryTree 按序挂接),
  // find 输出顺序不保证, 按路径段数排序并重算 parentPath (最近仓库祖先)
  const discovered: Array<{ remotePath: string; isSubmodule: boolean }> = [
    ...parsed.repoDirs.map((path) => ({
      remotePath: repoPathFromGitEntry(path),
      isSubmodule: false,
    })),
    ...parsed.repoFiles.map((path) => ({
      remotePath: repoPathFromGitEntry(path),
      isSubmodule: true,
    })),
  ];
  discovered.sort(
    (a, b) =>
      a.remotePath.split("/").length - b.remotePath.split("/").length ||
      a.remotePath.localeCompare(b.remotePath),
  );

  const scanned: ScannedRepository[] = discovered.map((entry) => {
    let parentPath: string | null = null;
    for (const candidate of discovered) {
      if (candidate.remotePath === entry.remotePath) {
        continue;
      }
      if (
        entry.remotePath.startsWith(`${candidate.remotePath.replace(/\/+$/, "")}/`) &&
        (parentPath === null || candidate.remotePath.length > parentPath.length)
      ) {
        parentPath = candidate.remotePath;
      }
    }
    return {
      path: `${options.keyBase}${entry.remotePath}`,
      name: remoteBasename(entry.remotePath),
      isSubmodule: entry.isSubmodule,
      // parentPath 同样折算为会话键空间
      parentPath: parentPath === null ? null : `${options.keyBase}${parentPath}`,
    };
  });

  onProgress?.({
    scannedDirectories: parsed.scannedDirectories,
    foundRepositories: scanned.length,
    currentDirectory: options.remotePath,
  });

  return {
    rootPath: `${options.keyBase}${options.remotePath}`,
    repositories: buildRepositoryTree(scanned),
    scannedDirectories: parsed.scannedDirectories,
  };
};
