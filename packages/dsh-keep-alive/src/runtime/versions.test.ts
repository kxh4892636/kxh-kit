import { rm } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  installTag,
  installedVersion,
  npmCliCandidates,
  resolveNpmCli,
  runNpm,
  OFFICIAL_REGISTRY,
  type Npm,
} from "./versions.js";
import { posix } from "node:path";
import { fixture, temporary, writePackage } from "../testing/fixture.js";
const launch = { cwd: process.cwd(), env: process.env as Record<string, string> };
const view = (tag: string): string[] => [
  "view",
  "@deepseek-ai/dsh@" + tag,
  "version",
  "--json",
  "--registry=" + OFFICIAL_REGISTRY,
];
const registryOf = (args: string[]): string | undefined =>
  args.find((arg: string): boolean => arg.startsWith("--registry="));
test("已安装版本复用，拒绝目录穿越和损坏元数据", async (): Promise<void> => {
  const f = await fixture();
  expect(await installedVersion(f.paths.versions, "1.0.0")).toEqual(f.version);
  const npm: Npm = async (args: string[]): Promise<string> => {
    expect(args).toEqual(view("alpha"));
    return '"1.0.0"';
  };
  expect(await installTag(f.paths.versions, launch, "alpha", npm)).toEqual(f.version);
  await expect(installedVersion(f.paths.versions, "../../escape")).rejects.toThrow();
  await expect(
    installTag(f.paths.versions, launch, "alpha", async (): Promise<string> => '"invalid"'),
  ).rejects.toThrow();
});
test("精确版本在安装完成后才发布，安装错误可重试", async (): Promise<void> => {
  const root = await temporary();
  let failed = true;
  const npm: Npm = async (args: string[]): Promise<string> => {
    if (args[0] === "view") {
      expect(args).toEqual(view("next"));
      return '"2.0.0-rc.1"';
    }
    expect(args.includes("@deepseek-ai/dsh@2.0.0-rc.1")).toBeTruthy();
    if (failed) throw new Error("network unavailable");
    await writePackage(args[args.indexOf("--prefix") + 1], "2.0.0-rc.1");
    return "";
  };
  await expect(installTag(root, launch, "next", npm)).rejects.toThrow(/network/);
  await expect(installedVersion(root, "2.0.0-rc.1")).rejects.toThrow();
  failed = false;
  const installed = await installTag(root, launch, "next", npm);
  expect(installed.version).toBe("2.0.0-rc.1");
  await rm(installed.entry);
  expect((await installTag(root, launch, "next", npm)).version).toBe("2.0.0-rc.1");
});
test("版本解析与安装直接使用 npm 官方源", async (): Promise<void> => {
  const root = await temporary();
  const calls: string[][] = [];
  const npm: Npm = async (args: string[]): Promise<string> => {
    calls.push(args);
    if (args[0] === "view") return '"2.0.0"';
    await writePackage(args[args.indexOf("--prefix") + 1], "2.0.0");
    return "";
  };
  expect((await installTag(root, launch, "alpha", npm)).version).toBe("2.0.0");
  expect(calls.length).toBe(2);
  for (const args of calls) expect(registryOf(args)).toBe("--registry=" + OFFICIAL_REGISTRY);
});
test("DSH_ALIVE_REGISTRY 覆盖默认源", async (): Promise<void> => {
  const root = await temporary();
  const calls: string[][] = [];
  const npm: Npm = async (args: string[]): Promise<string> => {
    calls.push(args);
    if (args[0] === "view") return '"2.0.0"';
    await writePackage(args[args.indexOf("--prefix") + 1], "2.0.0");
    return "";
  };
  const mirrored = { ...launch, env: { DSH_ALIVE_REGISTRY: "https://example.invalid" } };
  expect((await installTag(root, mirrored, "alpha", npm)).version).toBe("2.0.0");
  for (const args of calls) expect(registryOf(args)).toBe("--registry=https://example.invalid");
});
test("npm 失败直接传播且不重试", async (): Promise<void> => {
  const calls: string[][] = [];
  const npm: Npm = async (args: string[]): Promise<string> => {
    calls.push(args);
    throw new Error("npm error code ETARGET");
  };
  await expect(installTag(await temporary(), launch, "alpha", npm)).rejects.toThrow(/ETARGET/);
  expect(calls.length).toBe(1);
});
test("npm 解析按平台给出候选路径，并能执行真实 npm", async (): Promise<void> => {
  // 候选路径按目标平台语义生成, 与宿主平台无关: 断言使用 posix 拼接。
  const candidates = npmCliCandidates("/usr/bin/node", "linux");
  expect(candidates[0]).toBe(posix.join("/usr/bin", "node_modules", "npm", "bin", "npm-cli.js"));
  expect(candidates).toContain(
    posix.join("/usr/bin", "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  );
  expect(candidates).toContain("/usr/share/nodejs/npm/bin/npm-cli.js");
  // Windows 布局只有与 Node 同装的两个候选，不追加 POSIX 系统路径。
  const windows = npmCliCandidates("C:\\node\\node.exe", "win32");
  expect(windows).toHaveLength(2);
  expect(windows.every((path: string): boolean => !path.startsWith("/usr"))).toBe(true);
  // 与当前 Node 同装的 npm 能被解析到；PATH 里的 npm 不作为候选（可能是 sh 包装脚本）。
  expect(await resolveNpmCli(process.execPath, process.platform)).toMatch(/npm-cli\.js$/);
  expect(
    npmCliCandidates("/usr/bin/node", "linux").every((path: string): boolean =>
      path.endsWith("npm-cli.js"),
    ),
  ).toBe(true);
  // 全部候选缺失时报错文本可读，并列出尝试过的路径。
  await expect(resolveNpmCli("/opt/dsh-alive-missing/node", "linux")).rejects.toThrow(
    /Cannot find npm/,
  );
  // 本机真实 npm 可执行，失败会传播。
  expect(await runNpm(["--version"], launch)).toMatch(/^\d+\.\d+/);
  await expect(runNpm(["not-a-real-command"], launch)).rejects.toThrow();
});
