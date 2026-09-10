import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  DATA_ROOT_ENV,
  MAX_SOCKET_PATH,
  pathsFor,
  platformDataDirectory,
  preparePaths,
  readJson,
  saveJson,
} from "./paths.js";
import { temporary } from "./testing/fixture.js";
import { onPosix } from "./testing/platform.js";
import { errorText, portSchema, requestSchema } from "./contract.js";
test("状态原子覆盖并隔离端口", async (): Promise<void> => {
  const root = await temporary();
  const a = pathsFor(1234, root);
  const b = pathsFor(1235, root);
  expect(a.pipe).not.toBe(b.pipe);
  await preparePaths(a);
  await saveJson(a.state, { version: "1" });
  await saveJson(a.state, { version: "2" });
  expect(await readJson(a.state)).toEqual({ version: "2" });
  expect(a.versions).toBe(join(root, "1234", "versions"));
  await expect(readJson(b.state)).rejects.toThrow();
});
test("控制通道地址按平台生成：命名管道或 Unix socket", async (): Promise<void> => {
  const root = await temporary();
  const pipe = pathsFor(1234, root).pipe;
  if (process.platform === "win32")
    expect(pipe).toMatch(/^\\\\\.\\pipe\\dsh-keep-alive-[a-f0-9]{24}-1234$/);
  else expect(pipe).toBe(join(root, "1234", "control.sock"));
});
test("数据目录按平台解析，DSH_ALIVE_DATA 覆盖默认", (): void => {
  const env = { LOCALAPPDATA: "/win", XDG_DATA_HOME: "/xdg" };
  expect(platformDataDirectory("win32", env)).toBe(join("/win", "dsh-keep-alive"));
  expect(platformDataDirectory("darwin", env)).toBe(
    join(homedir(), "Library", "Application Support", "dsh-keep-alive"),
  );
  expect(platformDataDirectory("linux", env)).toBe(join("/xdg", "dsh-keep-alive"));
  expect(platformDataDirectory("linux", {})).toMatch(/\.local[/\\]share/);
  expect((): unknown => platformDataDirectory("win32", {})).toThrow(/LOCALAPPDATA/);
  const previous = process.env[DATA_ROOT_ENV];
  process.env[DATA_ROOT_ENV] = join("/tmp", "dsh-alive-override");
  try {
    expect(pathsFor(1).root).toBe(join("/tmp", "dsh-alive-override"));
  } finally {
    if (previous === undefined) delete process.env[DATA_ROOT_ENV];
    else process.env[DATA_ROOT_ENV] = previous;
  }
});
onPosix("POSIX 上控制通道路径过长时给出可读错误", (): void => {
  const deep = join("/tmp", "d".repeat(MAX_SOCKET_PATH), "p".repeat(MAX_SOCKET_PATH));
  expect((): unknown => pathsFor(1234, deep)).toThrow(/too long/);
});
test("外部输入拒绝非法端口与启动请求", (): void => {
  for (const port of [0, 65536, 1.5, NaN]) expect(portSchema.safeParse(port).success).toBe(false);
  expect(requestSchema.safeParse({ command: "start" }).success).toBe(false);
  expect(errorText(new Error("error"))).toBe("error");
  expect(errorText("error")).toBe("error");
});
