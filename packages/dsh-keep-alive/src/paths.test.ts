import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathsFor, preparePaths, saveJson, readJson } from "./paths.js";
import { temporary } from "./testing/fixture.js";
import { errorText, portSchema, requestSchema } from "./contract.js";
void test("状态原子覆盖并隔离端口", async (): Promise<void> => {
  const root = await temporary();
  const a = pathsFor(1234, root);
  const b = pathsFor(1235, root);
  assert.notEqual(a.pipe, b.pipe);
  assert.ok(a.pipe.startsWith("\\\\.\\pipe\\"));
  await preparePaths(a);
  await saveJson(a.state, { version: "1" });
  await saveJson(a.state, { version: "2" });
  assert.deepEqual(await readJson(a.state), { version: "2" });
  assert.equal(a.versions, join(root, "1234", "versions"));
  await assert.rejects(readJson(b.state));
});
void test("外部输入拒绝非法端口与启动请求", (): void => {
  for (const port of [0, 65536, 1.5, NaN]) assert.equal(portSchema.safeParse(port).success, false);
  assert.equal(requestSchema.safeParse({ command: "start" }).success, false);
  assert.equal(errorText(new Error("error")), "error");
  assert.equal(errorText("error"), "error");
  const previous = process.env.LOCALAPPDATA;
  delete process.env.LOCALAPPDATA;
  try {
    assert.throws((): import("./paths.js").Paths => pathsFor(1), /LOCALAPPDATA/);
  } finally {
    if (previous) process.env.LOCALAPPDATA = previous;
  }
});
