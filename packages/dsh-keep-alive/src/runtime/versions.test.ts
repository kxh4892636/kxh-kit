import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { installLatest, installedVersion, runNpm, type Npm } from "./versions.js";
import { fixture, temporary } from "../testing/fixture.js";
const launch = { cwd: process.cwd(), env: process.env as Record<string, string> };
void test("已安装版本复用，拒绝目录穿越和损坏元数据", async (): Promise<void> => {
  const f = await fixture();
  assert.deepEqual(await installedVersion(f.paths.versions, "1.0.0"), f.version);
  const npm: Npm = async (args: string[]): Promise<string> => {
    assert.equal(args[0], "view");
    return '"1.0.0"';
  };
  assert.deepEqual(await installLatest(f.paths.versions, launch, npm), f.version);
  await assert.rejects(installedVersion(f.paths.versions, "../../escape"));
  await assert.rejects(
    installLatest(f.paths.versions, launch, async (): Promise<string> => '"invalid"'),
  );
});
void test("精确版本在安装完成后才发布，安装错误可重试", async (): Promise<void> => {
  const root = await temporary();
  let failed = true;
  const npm: Npm = async (args: string[]): Promise<string> => {
    if (args[0] === "view") return '"2.0.0-rc.1"';
    assert.ok(args.includes("@deepseek-ai/dsh@2.0.0-rc.1"));
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
  await assert.rejects(installLatest(root, launch, npm), /network/);
  await assert.rejects(installedVersion(root, "2.0.0-rc.1"));
  failed = false;
  const installed = await installLatest(root, launch, npm);
  assert.equal(installed.version, "2.0.0-rc.1");
  await rm(installed.entry);
  assert.equal((await installLatest(root, launch, npm)).version, "2.0.0-rc.1");
});
void test("系统 Node 执行 npm 且传播失败", async (): Promise<void> => {
  assert.match(await runNpm(["--version"], launch), /^\d+\.\d+/);
  await assert.rejects(runNpm(["not-a-real-command"], launch));
});
