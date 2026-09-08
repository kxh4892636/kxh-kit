import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readJson, saveJson } from "../paths.js";
import { tagSchema, errorText, type Launch } from "../contract.js";
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
export const runNpm: Npm = async (
  args: string[],
  launch: Launch,
  timeout: number | undefined = 600000,
): Promise<string> => {
  const cli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  await access(cli);
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
// 只认 npm 的错误码行：命令行里出现的 tag 文本、宽泛的 404 文案都不该影响分类。
// 只有「配置的源里没有这个包或版本」才值得换官方源重试；网络故障重试官方源只会把等待翻倍。
const REGISTRY_MISS = /npm error code (?:ETARGET|E404)\b/;
const npmWithRegistryFallback = async (
  npm: Npm,
  args: string[],
  launch: Launch,
  remaining: () => number,
): Promise<string> => {
  try {
    return await npm(args, launch, remaining());
  } catch (error) {
    // 超时被杀的重试只会再超时一次，且其 stderr 可能是残缺的。
    if ((error as { killed?: boolean }).killed || !REGISTRY_MISS.test(errorText(error)))
      throw error;
    try {
      // 两次尝试共享同一个 deadline，总耗时不会翻倍。
      return await npm([...args, "--registry=" + OFFICIAL_REGISTRY], launch, remaining());
    } catch (fallback) {
      throw new Error(
        errorText(error) + "; official registry retry failed: " + errorText(fallback),
      );
    }
  }
};
export const installTag = async (
  directory: string,
  launch: Launch,
  tag: string,
  npm: Npm = runNpm,
): Promise<Version> => {
  const deadline = Date.now() + 600000;
  const remaining = (): number => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new Error("DSH installation timed out after 10 minutes");
    return ms;
  };
  const version = versionSchema.parse(
    JSON.parse(
      await npmWithRegistryFallback(
        npm,
        ["view", "@deepseek-ai/dsh@" + tag, "version", "--json"],
        launch,
        remaining,
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
    await npmWithRegistryFallback(
      npm,
      [
        "install",
        "--prefix",
        temporary,
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        "@deepseek-ai/dsh@" + version,
      ],
      launch,
      remaining,
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
