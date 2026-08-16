// e2e 专用 fake SSH executor (issue 06): 本机大概率没有可用 SSH 主机, e2e 以
// 语义等价的本机实现替换 ssh 传输层 —— git 命令在映射的本机目录真实执行,
// 扫描脚本经本地扫描器产出同格式输出 (再走真解析器回路), cat 读本机文件。
// 仅经环境变量开启 (见 resolveFakeSshConfig), 生产路径不加载。
// 已知取舍: 脚本里的 maxDepth/跳过名谓词不解析回本地扫描 (e2e 用默认参数)。
import { promises as fs } from "fs";
import { resolve, sep } from "path";

import type { RepositoryNode } from "../../types/repository.js";
import { scanForRepositories } from "../repo-scan/repo-scanner.js";
import { SCAN_SCRIPT_MARKER } from "../repo-scan/remote-repo-scanner.js";

import type { CommandExecutor, ExecOptions, ExecResult } from "./executor.js";
import { createLocalExecutor } from "./local-executor.js";

export const FAKE_SSH_ENV = "DIFF_VIEWER_FAKE_SSH";
export const FAKE_SSH_REMOTE_ENV = "DIFF_VIEWER_FAKE_SSH_REMOTE";
export const FAKE_SSH_LOCAL_ENV = "DIFF_VIEWER_FAKE_SSH_LOCAL";

export interface FakeSshExecutorConfig {
  // 远程 POSIX 路径前缀 → 本机目录, 如 { "/remote/ws": "D:\\fixture" }
  pathMap: Record<string, string>;
}

export const resolveFakeSshConfig = (env: NodeJS.ProcessEnv): FakeSshExecutorConfig | null => {
  if (env[FAKE_SSH_ENV]?.trim() !== "1") {
    return null;
  }
  const remote = env[FAKE_SSH_REMOTE_ENV]?.trim();
  const local = env[FAKE_SSH_LOCAL_ENV]?.trim();
  if (!remote || !local) {
    console.error(`${FAKE_SSH_ENV}=1 需要同时提供 ${FAKE_SSH_REMOTE_ENV} 与 ${FAKE_SSH_LOCAL_ENV}`);
    return null;
  }
  return { pathMap: { [remote]: local } };
};

// shellQuote 的逆操作 (仅服务标记行的根路径还原): '...' + '\'' 序列
const unquoteShell = (quoted: string): string | null => {
  if (!quoted.startsWith("'") || !quoted.endsWith("'")) {
    return null;
  }
  return quoted.slice(1, -1).replace(/'''/g, "'");
};

export const createFakeSshExecutor = (config: FakeSshExecutorConfig): CommandExecutor => {
  const local = createLocalExecutor();
  const mappings = Object.entries(config.pathMap).map(([remote, localPath]) => ({
    remote,
    localPath: resolve(localPath),
  }));

  const mapRemoteToLocal = (remotePath: string): string => {
    for (const { remote, localPath } of mappings) {
      if (remotePath === remote) {
        return localPath;
      }
      if (remotePath.startsWith(`${remote}/`)) {
        const remainder = remotePath.slice(remote.length + 1);
        return resolve(localPath, ...remainder.split("/"));
      }
    }
    throw new Error(`Remote path not mapped by fake ssh executor: ${remotePath}`);
  };

  const mapLocalToRemote = (localPath: string): string => {
    const resolvedLocal = resolve(localPath);
    for (const { remote, localPath: localRoot } of mappings) {
      if (resolvedLocal === localRoot) {
        return remote;
      }
      if (resolvedLocal.startsWith(`${localRoot}${sep}`)) {
        const remainder = resolvedLocal.slice(localRoot.length + 1);
        return `${remote}/${remainder.split(sep).join("/")}`;
      }
    }
    throw new Error(`Local path not mappable to remote by fake ssh executor: ${localPath}`);
  };

  const flattenNodes = (
    nodes: RepositoryNode[],
  ): Array<{ remotePath: string; isSubmodule: boolean }> =>
    nodes.flatMap((node) => [
      { remotePath: mapLocalToRemote(node.path), isSubmodule: node.isSubmodule },
      ...flattenNodes(node.children),
    ]);

  // 用本地扫描器产出与 find 脚本同格式的输出, 让真解析器走完整回路
  const runScanScript = async (script: string): Promise<ExecResult<string>> => {
    const firstLine = script.split("\n")[0] ?? "";
    const quotedRoot = firstLine.slice(SCAN_SCRIPT_MARKER.length).trim();
    const remoteRoot = unquoteShell(quotedRoot);
    if (remoteRoot === null) {
      throw new Error("Fake ssh executor: malformed scan script marker line");
    }

    const scanResult = await scanForRepositories(mapRemoteToLocal(remoteRoot));
    const flat = flattenNodes(scanResult.repositories);
    const dirEntries = flat.filter((entry) => !entry.isSubmodule);
    const fileEntries = flat.filter((entry) => entry.isSubmodule);

    const stdout = [
      "@@REPOS-DIR",
      ...dirEntries.map((entry) => `${entry.remotePath}/.git`),
      "@@REPOS-FILE",
      ...fileEntries.map((entry) => `${entry.remotePath}/.git`),
      "@@DIRS-COUNT",
      String(scanResult.scannedDirectories),
      "",
    ].join("\n");
    return { stdout, stderr: "", exitCode: 0 };
  };

  const readMappedFile = async (remotePath: string): Promise<Buffer> => {
    const localPath = mapRemoteToLocal(remotePath);
    return fs.readFile(localPath);
  };

  const exec = async (
    command: string,
    args: readonly string[],
    options?: ExecOptions,
  ): Promise<ExecResult<string>> => {
    if (command === "git") {
      if (options?.cwd === undefined) {
        throw new Error("Fake ssh executor: git exec requires cwd");
      }
      return local.exec("git", args, { ...options, cwd: mapRemoteToLocal(options.cwd) });
    }
    if (command === "sh" && args[0] === "-c" && args[1]?.startsWith(SCAN_SCRIPT_MARKER)) {
      return runScanScript(args[1]);
    }
    if (command === "cat" && args.length === 1 && args[0] !== undefined) {
      const content = await readMappedFile(args[0]);
      return { stdout: content.toString("utf8"), stderr: "", exitCode: 0 };
    }
    throw new Error(`Fake ssh executor: unsupported command: ${command} ${args.join(" ")}`);
  };

  const execBuffer = async (
    command: string,
    args: readonly string[],
    options?: ExecOptions,
  ): Promise<ExecResult<Buffer>> => {
    if (command === "git") {
      if (options?.cwd === undefined) {
        throw new Error("Fake ssh executor: git exec requires cwd");
      }
      return local.execBuffer("git", args, { ...options, cwd: mapRemoteToLocal(options.cwd) });
    }
    if (command === "cat" && args.length === 1 && args[0] !== undefined) {
      const content = await readMappedFile(args[0]);
      return { stdout: content, stderr: "", exitCode: 0 };
    }
    throw new Error(`Fake ssh executor: unsupported command: ${command} ${args.join(" ")}`);
  };

  return { exec, execBuffer };
};
