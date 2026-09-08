import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { symlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { temporary } from "./testing/fixture.js";

const exec = promisify(execFile);

void test("通过 nvm 风格目录链接执行时仍进入 CLI", async (): Promise<void> => {
  const root = await temporary();
  const linked = join(root, "nodejs");
  await symlink(fileURLToPath(new URL(".", import.meta.url)), linked, "junction");
  const result = await exec(process.execPath, [join(linked, "main.js"), "--help"], {
    windowsHide: true,
    timeout: 10_000,
  });
  assert.match(result.stdout, /start --port N/);
  assert.equal(result.stderr, "");
});
