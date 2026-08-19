import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonError } from "../../../cli/json-error";
import { runCli } from "../../../cli/run";
import { makeClient } from "../../../test-helpers/make-client";
import {
  startFakeAnkiConnect,
  type FakeAnkiConnect,
} from "../../../test-fixtures/fake-anki-connect";
import { runSync } from "../sync-command";

const servers: FakeAnkiConnect[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("runSync", () => {
  it("同步成功返回 success 结果", async () => {
    const server = await startFakeAnkiConnect(() => ({ result: null }));
    servers.push(server);

    const result = await runSync(makeClient(server.url));

    expect(result.success).toBe(true);
    expect(result.message).toContain("AnkiWeb");
    expect(new Date(result.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("同步失败抛 JsonError(action=sync + 登录提示)", async () => {
    const server = await startFakeAnkiConnect(() => ({ error: "boom" }));
    servers.push(server);
    const client = makeClient(server.url);

    try {
      await runSync(client);
      expect.unreachable("runSync 应当抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonError);
      expect((error as JsonError).action).toBe("sync");
      expect((error as JsonError).hint).toContain("AnkiWeb");
      expect((error as JsonError).message).toContain("boom");
    }
  });
});

describe("CLI 端到端(runCli, 进程内)", () => {
  const capture = () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    return { stdout, stderr };
  };

  // 错误 JSON 以单次 write 输出(内部含换行), 从最后一个可解析的 chunk 取。
  const lastJsonChunk = (chunks: string[]): Record<string, unknown> => {
    for (let i = chunks.length - 1; i >= 0; i--) {
      const chunk = chunks[i];
      if (chunk === undefined) {
        continue;
      }
      try {
        return JSON.parse(chunk.trim()) as Record<string, unknown>;
      } catch {
        // commander 可能先输出人类可读错误行, 继续向前找
      }
    }
    throw new Error("输出中没有 JSON 块");
  };

  it("sync 在线: stdout 输出 success JSON, 退出码 0", async () => {
    const server = await startFakeAnkiConnect(() => ({ result: null }));
    servers.push(server);
    const { stdout } = capture();

    await runCli(["sync", "--anki-connect", server.url]);

    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(parsed).toMatchObject({ success: true });
    expect(parsed["timestamp"]).toBeTruthy();
  });

  it("sync 离线: stderr 输出错误 JSON, 退出码 1", async () => {
    const server = await startFakeAnkiConnect(() => ({ result: null }));
    const url = server.url;
    await server.close();
    const { stderr } = capture();

    await runCli(["sync", "--anki-connect", url]);

    expect(process.exitCode).toBe(1);
    expect(lastJsonChunk(stderr)).toMatchObject({ success: false });
  });

  it("未知命令: 退出码 2, stderr 输出错误 JSON", async () => {
    const { stderr } = capture();

    await runCli(["definitely-not-a-command"]);

    expect(process.exitCode).toBe(2);
    expect(lastJsonChunk(stderr)).toMatchObject({ success: false });
  });

  it("--help: 输出用法文本且退出码 0", async () => {
    const { stdout } = capture();

    await runCli(["--help"]);

    expect(process.exitCode).toBe(0);
    expect(stdout.join("")).toContain("Usage");
    expect(stdout.join("")).toContain("sync");
  });

  it("--compact: stdout 输出单行 JSON", async () => {
    const server = await startFakeAnkiConnect(() => ({ result: null }));
    servers.push(server);
    const { stdout } = capture();

    await runCli(["sync", "--anki-connect", server.url, "--compact"]);

    expect(process.exitCode).toBe(0);
    expect(stdout.join("").split("\n").filter(Boolean)).toHaveLength(1);
  });
});
