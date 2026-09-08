import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { appendLog, LOG_LIMIT } from "./log.js";
import { temporary } from "../testing/fixture.js";
void test("日志按字节轮转并最多保留三个文件", async (): Promise<void> => {
  const directory = await temporary();
  const file = join(directory, "dsh.log");
  assert.equal(LOG_LIMIT, 5242880);
  appendLog(file, "12345", 5);
  appendLog(file, Buffer.from("abcdeFGHIJKLMNO"), 5);
  assert.deepEqual((await readdir(directory)).sort(), ["dsh.log", "dsh.log.1", "dsh.log.2"]);
  assert.equal(await readFile(file, "utf8"), "KLMNO");
  assert.equal(await readFile(file + ".1", "utf8"), "FGHIJ");
  assert.equal((await stat(file + ".2")).size, 5);
});
