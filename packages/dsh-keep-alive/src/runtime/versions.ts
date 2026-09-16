import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { join, posix, win32 } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readJson, saveJson } from "../paths.js";
import { tagSchema, type Launch } from "../contract.js";
import type { Paths } from "../paths.js";
const exec = promisify(execFile);
const versionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/);
// 未显式指定通道时跟随 npm 的 latest 标签。
export const DEFAULT_TAG = "latest";
export interface Version {
  version: string;
  entry: string;
}
// state.json 记录该端口最近启动的版本与当时跟随的通道。
export interface RecordedState {
  version: string;
  tag: string;
}
const recordedSchema = z.object({ version: versionSchema, tag: z.string().optional() });
export const readRecordedState = async (path: string): Promise<RecordedState | undefined> => {
  try {
    const recorded = recordedSchema.parse(await readJson(path));
    // 旧状态文件没有 tag 字段；通道也可能被人工改成非法值。两种情况都按默认通道处理。
    const tag = tagSchema.safeParse(recorded.tag ?? DEFAULT_TAG);
    return { version: recorded.version, tag: tag.success ? tag.data : DEFAULT_TAG };
  } catch {
    // 读取失败或内容损坏时按「没有记录」处理：调用方回退到当前通道与全新安装。
    return undefined;
  }
};
export const saveRecordedState = async (path: string, recorded: RecordedState): Promise<void> =>
  saveJson(path, recorded);
export type Npm = (args: string[], launch: Launch, timeout?: number) => Promise<string>;
// npm 的安装布局随平台与包管理器不同；supervisor 继承的环境不一定含 PATH，
// 因此优先用与当前 Node 同装的 npm-cli.js，再退回常见系统路径。
export const npmCliCandidates = (
  execPath: string = process.execPath,
  platform: string = process.platform,
): string[] => {
  // platform 参数用于模拟其它平台, 因此候选路径必须按目标平台的语义拼接,
  // 不能用宿主 path 语义(否则 Windows 宿主上模拟 linux 会得到 C:\usr\...)。
  const platformPath = platform === "win32" ? win32 : posix;
  const directory = platformPath.dirname(execPath);
  // 与当前 Node 同装的 npm 优先；PATH 里的 npm 可能是 sh 包装脚本（Volta/asdf/corepack），
  // 不能交给 node 执行，故不作为候选。
  const candidates = [
    platformPath.join(directory, "node_modules", "npm", "bin", "npm-cli.js"),
    platformPath.join(directory, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  if (platform === "win32") {
    return candidates.map((path: string): string => platformPath.resolve(path));
  }
  return [
    ...candidates,
    "/usr/share/nodejs/npm/bin/npm-cli.js",
    "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
    "/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js",
  ].map((path: string): string => platformPath.resolve(path));
};
export const resolveNpmCli = async (
  execPath: string = process.execPath,
  platform: string = process.platform,
): Promise<string> => {
  const candidates = npmCliCandidates(execPath, platform);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // 继续尝试下一个候选路径。
    }
  }
  throw new Error(
    "Cannot find npm for " +
      execPath +
      "; install npm next to this Node.js (tried " +
      candidates.join(", ") +
      ")",
  );
};
export const runNpm: Npm = async (
  args: string[],
  launch: Launch,
  timeout: number | undefined = 600000,
): Promise<string> => {
  const cli = await resolveNpmCli();
  const { stdout } = await exec(process.execPath, [cli, ...args], {
    cwd: launch.cwd,
    env: launch.env,
    windowsHide: true,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
};
const inspectPackage = async (directory: string, version: string): Promise<Version> => {
  const home = join(directory, "node_modules", "@deepseek-ai", "dsh");
  const manifest = z
    .object({ version: z.literal(version), bin: z.object({ dsh: z.literal("lib/bin.js") }) })
    .parse(await readJson(join(home, "package.json")));
  const entry = join(home, manifest.bin.dsh);
  await access(entry);
  return { version, entry };
};
export const installedVersion = async (directory: string, version: string): Promise<Version> => {
  versionSchema.parse(version);
  return inspectPackage(join(directory, version), version);
};
export const OFFICIAL_REGISTRY = "https://registry.npmjs.org";
// DSH 的版本解析与安装直接使用 npm 官方源，不读取本机 registry 配置：
// 镜像源可能缺发布标签的依赖（实测 npmmirror 缺 alpha 子包），跟随本机配置会得到不可复现的结果。
// 需要镜像时用 DSH_ALIVE_REGISTRY 覆盖。
const registryFor = (launch: Launch): string => launch.env.DSH_ALIVE_REGISTRY ?? OFFICIAL_REGISTRY;
export const installTag = async (
  directory: string,
  launch: Launch,
  tag: string,
  npm: Npm = runNpm,
): Promise<Version> => {
  const registry = registryFor(launch);
  const deadline = Date.now() + 600000;
  const remaining = (): number => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new Error("DSH installation timed out after 10 minutes");
    return ms;
  };
  const version = versionSchema.parse(
    JSON.parse(
      await npm(
        ["view", "@deepseek-ai/dsh@" + tag, "version", "--json", "--registry=" + registry],
        launch,
        remaining(),
      ),
    ),
  );
  try {
    return await installedVersion(directory, version);
  } catch {
    /* 不复用半安装目录。 */
  }
  const temporary = join(directory, ".install-" + randomUUID());
  await mkdir(temporary, { recursive: true });
  try {
    await npm(
      [
        "install",
        "--prefix",
        temporary,
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        "@deepseek-ai/dsh@" + version,
        "--registry=" + registry,
      ],
      launch,
      remaining(),
    );
    remaining();
    await inspectPackage(temporary, version);
    const target = join(directory, version);
    try {
      await rename(target, join(directory, ".broken-" + randomUUID()));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(temporary, target);
    return await installedVersion(directory, version);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};
export interface PreparedVersion {
  version: Version;
  tag: string;
  changed: boolean;
}
// 解析通道版本并与该端口记录比较，有变化才写入 state.json；supervisor 与 CLI 共用这一不变量。
export const prepareVersion = async (
  paths: Paths,
  launch: Launch,
  tag: string,
  prepare: (directory: string, launch: Launch, tag: string) => Promise<Version> = installTag,
): Promise<PreparedVersion> => {
  const recorded = await readRecordedState(paths.state);
  const version = await prepare(paths.versions, launch, tag);
  const changed = version.version !== recorded?.version || tag !== recorded?.tag;
  if (changed) await saveRecordedState(paths.state, { version: version.version, tag });
  return { version, tag, changed };
};
// supervisor 与 CLI 两条路径共用同一句日志，避免「是否发生更新」的说法漂移。
export const preparedMessage = (prepared: PreparedVersion): string =>
  prepared.changed
    ? "Prepared DSH " + prepared.version.version + " (tag " + prepared.tag + ")"
    : "No change for tag " + prepared.tag + " (DSH " + prepared.version.version + ")";
