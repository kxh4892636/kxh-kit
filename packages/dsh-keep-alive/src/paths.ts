import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir, userInfo } from "node:os";
import { randomUUID } from "node:crypto";
export interface Paths {
  root: string;
  directory: string;
  versions: string;
  log: string;
  state: string;
  pipe: string;
}
// POSIX 上 Unix socket 的路径长度上限约 104 字节；留出余量后给出可读错误而不是 EINVAL。
export const MAX_SOCKET_PATH = 90;
export const DATA_ROOT_ENV = "DSH_ALIVE_DATA";
export const platformDataDirectory = (
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  if (platform === "win32") {
    if (!env.LOCALAPPDATA) throw new Error("LOCALAPPDATA is required");
    return join(env.LOCALAPPDATA, "dsh-keep-alive");
  }
  // macOS 的数据目录按平台约定解析。
  if (platform === "darwin")
    return join(homedir(), "Library", "Application Support", "dsh-keep-alive");
  // Linux 与其他 POSIX：遵循 XDG 数据目录，缺省 ~/.local/share。
  return join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "dsh-keep-alive");
};
export const pathsFor = (
  port: number,
  override?: string,
  platform: string = process.platform,
): Paths => {
  // 覆盖优先级：显式入参（测试）→ 环境变量（用户与冒烟）→ 平台默认目录。
  const configured = override ?? process.env[DATA_ROOT_ENV];
  const directoryRoot = configured
    ? resolve(configured)
    : platformDataDirectory(platform, process.env);
  const directory = join(directoryRoot, String(port));
  if (platform === "win32") {
    // 命名管道共享同一命名空间，用用户名哈希隔离；POSIX 由 0700 状态目录隔离，无需哈希。
    const user = createHash("sha256")
      .update(userInfo().username + directoryRoot.toLowerCase())
      .digest("hex")
      .slice(0, 24);
    return {
      root: directoryRoot,
      directory,
      versions: join(directory, "versions"),
      log: join(directory, "dsh.log"),
      state: join(directory, "state.json"),
      pipe: `\\\\.\\pipe\\dsh-keep-alive-${user}-${port}`,
    };
  }
  // POSIX：控制通道是每端口目录内的 Unix socket，目录权限隔离用户。
  const socket = join(directory, "control.sock");
  if (Buffer.byteLength(socket) > MAX_SOCKET_PATH)
    throw new Error(
      "Control socket path is too long (" +
        Buffer.byteLength(socket) +
        " > " +
        MAX_SOCKET_PATH +
        "): " +
        socket,
    );
  return {
    root: directoryRoot,
    directory,
    versions: join(directory, "versions"),
    log: join(directory, "dsh.log"),
    state: join(directory, "state.json"),
    pipe: socket,
  };
};
export const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"));
export const saveJson = async (path: string, value: unknown): Promise<void> => {
  const temporary = path + "." + randomUUID() + ".tmp";
  await writeFile(temporary, JSON.stringify(value) + "\n", { mode: 0o600 });
  await rename(temporary, path);
};
export const preparePaths = async (paths: Paths): Promise<void> => {
  // 目录权限 0700：POSIX 上控制通道 socket 与其守护的状态只对当前用户可见。
  await mkdir(paths.versions, { recursive: true, mode: 0o700 });
  // mkdir 的 mode 不会收紧已存在的目录，故显式再设一次（Windows 上 chmod 无意义，跳过）。
  if (process.platform !== "win32") await chmod(paths.directory, 0o700);
};
