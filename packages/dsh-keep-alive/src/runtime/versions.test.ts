import { rm } from "node:fs/promises";
import { expect, test } from "vitest";
import { installTag, installedVersion, runNpm, OFFICIAL_REGISTRY, type Npm } from "./versions.js";
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
test("系统 Node 执行 npm 且传播失败", async (): Promise<void> => {
  expect(await runNpm(["--version"], launch)).toMatch(/^\d+\.\d+/);
  await expect(runNpm(["not-a-real-command"], launch)).rejects.toThrow();
});
