import { join } from "node:path";
import { expect, test } from "vitest";
import { pathsFor, preparePaths, saveJson, readJson } from "./paths.js";
import { temporary } from "./testing/fixture.js";
import { errorText, portSchema, requestSchema } from "./contract.js";
test("状态原子覆盖并隔离端口", async (): Promise<void> => {
  const root = await temporary();
  const a = pathsFor(1234, root);
  const b = pathsFor(1235, root);
  expect(a.pipe).not.toBe(b.pipe);
  expect(a.pipe.startsWith("\\\\.\\pipe\\")).toBeTruthy();
  await preparePaths(a);
  await saveJson(a.state, { version: "1" });
  await saveJson(a.state, { version: "2" });
  expect(await readJson(a.state)).toEqual({ version: "2" });
  expect(a.versions).toBe(join(root, "1234", "versions"));
  await expect(readJson(b.state)).rejects.toThrow();
});
test("外部输入拒绝非法端口与启动请求", (): void => {
  for (const port of [0, 65536, 1.5, NaN]) expect(portSchema.safeParse(port).success).toBe(false);
  expect(requestSchema.safeParse({ command: "start" }).success).toBe(false);
  expect(errorText(new Error("error"))).toBe("error");
  expect(errorText("error")).toBe("error");
  const previous = process.env.LOCALAPPDATA;
  delete process.env.LOCALAPPDATA;
  try {
    expect((): import("./paths.js").Paths => pathsFor(1)).toThrow(/LOCALAPPDATA/);
  } finally {
    if (previous) process.env.LOCALAPPDATA = previous;
  }
});
