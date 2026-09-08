import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { installTag, installedVersion, runNpm, type Npm } from "./versions.js";
import { fixture, temporary } from "../testing/fixture.js";
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
    const prefix = args[args.indexOf("--prefix") + 1];
    const directory = join(prefix, "node_modules", "@deepseek-ai", "dsh");
    await mkdir(join(directory, "lib"), { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ version: "2.0.0-rc.1", bin: { dsh: "lib/bin.js" } }),
    );
    await writeFile(join(directory, "lib", "bin.js"), "");
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
test("系统 Node 执行 npm 且传播失败", async (): Promise<void> => {
  expect(await runNpm(["--version"], launch)).toMatch(/^\d+\.\d+/);
  await expect(runNpm(["not-a-real-command"], launch)).rejects.toThrow();
});
