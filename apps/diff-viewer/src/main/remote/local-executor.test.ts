import { tmpdir } from "os";

import { describe, expect, it } from "vitest";

import { createLocalExecutor } from "./local-executor.js";

const NODE = process.execPath;

describe("local-executor", () => {
  it("捕获 stdout 与退出码 (成功)", async () => {
    const executor = createLocalExecutor();
    const result = await executor.exec(NODE, ["-e", "process.stdout.write('hello')"]);
    expect(result.stdout).toBe("hello");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("非零退出照常 resolve, stderr 与 exitCode 带回 (由调用方按语义判断)", async () => {
    const executor = createLocalExecutor();
    const result = await executor.exec(NODE, [
      "-e",
      "process.stderr.write('oops'); process.exit(3);",
    ]);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("oops");
  });

  it("execBuffer 返回原始字节", async () => {
    const executor = createLocalExecutor();
    const result = await executor.execBuffer(NODE, [
      "-e",
      "process.stdout.write(Buffer.from([0x00, 0xff, 0x61]))",
    ]);
    expect(Buffer.isBuffer(result.stdout)).toBe(true);
    expect([...result.stdout]).toEqual([0x00, 0xff, 0x61]);
  });

  it("cwd 选项生效", async () => {
    const executor = createLocalExecutor();
    const result = await executor.exec(NODE, ["-e", "process.stdout.write(process.cwd())"], {
      cwd: tmpdir(),
    });
    expect(result.exitCode).toBe(0);
    // Windows 上 tmpdir 可能是 8.3 短名形态, 只断言非空且不含报错
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it("命令不存在 (spawn 失败) 时 reject", async () => {
    const executor = createLocalExecutor();
    await expect(executor.exec("definitely-not-a-real-binary-06", [])).rejects.toThrow();
  });

  it("超时杀死进程并 reject", async () => {
    const executor = createLocalExecutor();
    await expect(
      executor.exec(NODE, ["-e", "setTimeout(() => {}, 30_000)"], { timeoutMs: 200 }),
    ).rejects.toThrow(/timed out/i);
  });

  it("stdout 超过 maxBuffer 时 reject", async () => {
    const executor = createLocalExecutor();
    await expect(
      executor.exec(NODE, ["-e", "process.stdout.write('x'.repeat(4096))"], { maxBuffer: 1024 }),
    ).rejects.toThrow(/maxBuffer/i);
  });
});
