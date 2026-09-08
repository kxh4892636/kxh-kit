import { rm } from "node:fs/promises";
import { expect, test } from "vitest";
import { installTag, installedVersion, runNpm, OFFICIAL_REGISTRY, type Npm } from "./versions.js";
import { fixture, temporary, writePackage } from "../testing/fixture.js";
const launch = { cwd: process.cwd(), env: process.env as Record<string, string> };
test("已安装版本复用，拒绝目录穿越和损坏元数据", async (): Promise<void> => {
  const f = await fixture();
  expect(await installedVersion(f.paths.versions, "1.0.0")).toEqual(f.version);
  const npm: Npm = async (args: string[]): Promise<string> => {
    expect(args).toEqual(["view", "@deepseek-ai/dsh@alpha", "version", "--json"]);
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
      expect(args).toEqual(["view", "@deepseek-ai/dsh@next", "version", "--json"]);
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
test("镜像源缺包时退回官方源重试", async (): Promise<void> => {
  const root = await temporary();
  const calls: string[][] = [];
  const npm: Npm = async (args: string[]): Promise<string> => {
    calls.push(args);
    if (args[0] === "view") return '"2.0.0"';
    const official = args.some((arg: string): boolean => arg.startsWith("--registry="));
    if (!official) throw new Error("No matching version found for @deepseek-ai/dsh-fs-local");
    await writePackage(args[args.indexOf("--prefix") + 1], "2.0.0");
    return "";
  };
  expect((await installTag(root, launch, "alpha", npm)).version).toBe("2.0.0");
  expect(
    calls.some((args: string[]): boolean => args.includes("--registry=" + OFFICIAL_REGISTRY)),
  ).toBeTruthy();
  expect(calls.filter((args: string[]): boolean => args[0] === "install").length).toBe(2);
});
test("官方源也失败时保留两段原因", async (): Promise<void> => {
  const root = await temporary();
  const npm: Npm = async (args: string[]): Promise<string> => {
    if (args[0] === "view") return '"2.0.0"';
    throw new Error(
      args.some((arg: string): boolean => arg.startsWith("--registry="))
        ? "official registry unavailable"
        : "No matching version found for @deepseek-ai/dsh-fs-local@0.1.5-alpha.1",
    );
  };
  await expect(installTag(root, launch, "alpha", npm)).rejects.toThrow(
    /No matching version found.*; official registry retry failed: official registry unavailable/,
  );
});
test("网络故障不回退官方源", async (): Promise<void> => {
  const calls: string[][] = [];
  const npm: Npm = async (args: string[]): Promise<string> => {
    calls.push(args);
    throw new Error("npm error code ECONNREFUSED");
  };
  await expect(installTag(await temporary(), launch, "alpha", npm)).rejects.toThrow(/ECONNREFUSED/);
  expect(calls.length).toBe(1);
});
test("系统 Node 执行 npm 且传播失败", async (): Promise<void> => {
  expect(await runNpm(["--version"], launch)).toMatch(/^\d+\.\d+/);
  await expect(runNpm(["not-a-real-command"], launch)).rejects.toThrow();
});
