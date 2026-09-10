import { createConnection, createServer } from "node:net";
import { writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { request, serve } from "./transport.js";
import { pathsFor, preparePaths } from "../paths.js";
import { temporary } from "../testing/fixture.js";
import { onPosix } from "../testing/platform.js";
import type { Reply, Request } from "../contract.js";
// 控制通道地址按平台生成：Windows 命名管道，POSIX 状态目录内的 Unix socket。
// 每个用例用独立临时根目录，socket 文件互不干扰。
let nextPort = 21000;
const pipe = async (): Promise<string> => {
  const root = await temporary();
  nextPort++;
  const paths = pathsFor(nextPort, root);
  // POSIX 上 socket 文件位于每端口状态目录内，目录必须先存在。
  await preparePaths(paths);
  return paths.pipe;
};
const status = {
  port: 1234,
  state: "stopped" as const,
  pid: null,
  version: null,
  error: null,
  log: "file",
  tag: null,
  prepared: null,
};
test("控制通道传递成功与业务错误", async (): Promise<void> => {
  const address = await pipe();
  const server = await serve(address, async (message: Request): Promise<Reply> => {
    if (message.command === "stop") throw new Error("stop failed");
    return { ok: true, status };
  });
  try {
    expect(await request(address, { command: "status" })).toEqual({ ok: true, status });
    expect(await request(address, { command: "stop" })).toEqual({
      ok: false,
      error: "stop failed",
    });
    await expect(
      serve(address, async (): Promise<Reply> => ({ ok: true, status })),
    ).rejects.toThrow();
  } finally {
    server.close();
  }
});
test("损坏回复、断连和超时不会被当作成功", async (): Promise<void> => {
  for (const mode of ["invalid", "close", "timeout"]) {
    const address = await pipe();
    const server = createServer((socket: import("node:net").Socket): void => {
      socket.on("error", (): void => {});
      if (mode === "invalid") socket.end("invalid\n");
      if (mode === "close") socket.end();
    });
    await new Promise<void>((resolve: (value: void | PromiseLike<void>) => void): unknown =>
      server.listen(address, resolve),
    );
    try {
      await expect(request(address, { command: "status" }, 20)).rejects.toThrow();
    } finally {
      server.close();
    }
  }
});
onPosix("陈旧 socket 文件被清理，活着的控制通道被拒绝接管", async (): Promise<void> => {
  const address = await pipe();
  // 模拟 supervisor 被强杀后留下的 socket 文件：无人应答时删除后重新绑定。
  await writeFile(address, "");
  const server = await serve(address, async (): Promise<Reply> => ({ ok: true, status }));
  try {
    expect(await request(address, { command: "status" })).toEqual({ ok: true, status });
    // 已有 supervisor 在应答：不得再绑定同一地址。
    await expect(
      serve(address, async (): Promise<Reply> => ({ ok: true, status })),
    ).rejects.toThrow(/already in use/);
  } finally {
    server.close();
  }
});
test("非法请求被拒绝，超大请求断开", async (): Promise<void> => {
  const address = await pipe();
  const server = await serve(address, async (): Promise<Reply> => ({ ok: true, status }));
  try {
    for (const input of ['{"command":"bad"}\n', "x".repeat(1024 * 1024 + 1)]) {
      const result = await new Promise<string>(
        (resolve: (value: string | PromiseLike<string>) => void): void => {
          const socket = createConnection(address);
          let output = "";
          socket.on("error", (): void => {});
          socket.on("data", (data: Buffer): void => {
            output += data;
          });
          socket.on("close", (): void => resolve(output));
          socket.on("connect", (): void => {
            socket.write(input);
          });
        },
      );
      expect(result).toBe("");
    }
  } finally {
    server.close();
  }
});
