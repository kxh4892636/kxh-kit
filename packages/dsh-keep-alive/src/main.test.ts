import { execFile } from "node:child_process";
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { temporary } from "./testing/fixture.js";

const exec = promisify(execFile);

test("通过 nvm 风格目录链接执行时仍进入 CLI", async (): Promise<void> => {
  const root = await temporary();
  const linked = join(root, "nodejs");
  // 打包后 CLI 入口为 dist/main.mjs；链接指向打包目录以复现 nvm 的目录链接场景。
  await symlink(fileURLToPath(new URL("../dist", import.meta.url)), linked, "junction");
  const result = await exec(process.execPath, [join(linked, "main.mjs"), "--help"], {
    windowsHide: true,
    timeout: 10_000,
  });
  expect(result.stdout).toMatch(/start \[--port N\]/);
  expect(result.stderr).toBe("");
  const failure = await exec(process.execPath, [join(linked, "main.mjs"), "bad"], {
    windowsHide: true,
    timeout: 10_000,
  }).then(
    (output): string => output.stderr,
    (error: { stderr?: string }): string => error.stderr ?? "",
  );
  expect(failure).toMatch(/^dsh-alive: /);
});
