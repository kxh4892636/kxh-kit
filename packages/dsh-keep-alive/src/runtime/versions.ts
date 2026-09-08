import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readJson } from "../paths.js";
import type { Launch } from "../contract.js";
const exec = promisify(execFile);
const versionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/);
// 未显式指定通道时跟随 npm 的 latest 标签。
export const DEFAULT_TAG = "latest";
export interface Version {
  version: string;
  entry: string;
}
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
      await npm(["view", "@deepseek-ai/dsh@" + tag, "version", "--json"], launch, remaining()),
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
