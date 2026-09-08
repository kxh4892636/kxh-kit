import { createConnection, createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { request, serve } from "./transport.js";
const pipe = (): string => "\\\\.\\pipe\\dsh-test-" + randomUUID();
const status = {
  port: 1234,
  state: "stopped" as const,
  pid: null,
  version: null,
  error: null,
  log: "file",
};
test("控制通道传递成功与业务错误", async (): Promise<void> => {
  const address = pipe();
  const server = await serve(
    address,
    async (
      message:
        | { command: "start"; launch: { cwd: string; env: Record<string, string> } }
        | { command: "stop" }
        | { command: "status" },
    ): Promise<{
      ok: true;
      status: {
        port: number;
        state: "stopped";
        pid: null;
        version: null;
        error: null;
        log: string;
      };
    }> => {
      if (message.command === "stop") throw new Error("stop failed");
      return { ok: true, status };
    },
  );
  try {
    expect(await request(address, { command: "status" })).toEqual({ ok: true, status });
    expect(await request(address, { command: "stop" })).toEqual({
      ok: false,
      error: "stop failed",
    });
    await expect(
      serve(
        address,
        async (): Promise<{
          ok: true;
          status: {
            port: number;
            state: "stopped";
            pid: null;
            version: null;
            error: null;
            log: string;
          };
        }> => ({ ok: true, status }),
      ),
    ).rejects.toThrow();
  } finally {
    server.close();
  }
});
test("损坏回复、断连和超时不会被当作成功", async (): Promise<void> => {
  for (const mode of ["invalid", "close", "timeout"]) {
    const address = pipe();
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
test("非法请求被拒绝，超大请求断开", async (): Promise<void> => {
  const address = pipe();
  const server = await serve(
    address,
    async (): Promise<{
      ok: true;
      status: {
        port: number;
        state: "stopped";
        pid: null;
        version: null;
        error: null;
        log: string;
      };
    }> => ({ ok: true, status }),
  );
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
