import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { appendLog, LOG_LIMIT } from "./log.js";
import { temporary } from "../testing/fixture.js";
test("日志按字节轮转并最多保留三个文件", async (): Promise<void> => {
  const directory = await temporary();
  const file = join(directory, "dsh.log");
  expect(LOG_LIMIT).toBe(5242880);
  appendLog(file, "12345", 5);
  appendLog(file, Buffer.from("abcdeFGHIJKLMNO"), 5);
  expect((await readdir(directory)).sort()).toEqual(["dsh.log", "dsh.log.1", "dsh.log.2"]);
  expect(await readFile(file, "utf8")).toBe("KLMNO");
  expect(await readFile(file + ".1", "utf8")).toBe("FGHIJ");
  expect((await stat(file + ".2")).size).toBe(5);
});
