import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  clearInterrupted,
  describeError,
  installCrashGuard,
  readInterrupted,
  stateDirectory,
  withTimeout,
  writeInterrupted,
} from "./errors.ts";

const created: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "pi-errors-"));
  created.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("中断凭据", () => {
  it("写入、读出、清除", async () => {
    const dir = await tempDir();
    expect(readInterrupted(dir)).toBeUndefined();
    writeInterrupted(dir, {
      at: "2026-11-07T00:00:00.000Z",
      reason: "boom",
      plans: ["etf/active/x"],
    });
    expect(readInterrupted(dir)).toEqual({
      at: "2026-11-07T00:00:00.000Z",
      reason: "boom",
      plans: ["etf/active/x"],
    });
    clearInterrupted(dir);
    expect(readInterrupted(dir)).toBeUndefined();
  });

  it("损坏的文件当作没有", async () => {
    const dir = await tempDir();
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "interrupted.json"), "{not json", "utf8");
    expect(readInterrupted(dir)).toBeUndefined();
  });

  it("状态目录在 agent 目录下的 orchestrator 子目录", () => {
    expect(stateDirectory("/agent")).toBe(join("/agent", "orchestrator"));
  });
});

describe("进程兜底", () => {
  it("崩溃时落盘 live plan 并以非零码退出", async () => {
    const dir = await tempDir();
    const exits: number[] = [];
    const uninstall = installCrashGuard(
      { directory: () => dir, plans: () => ["etf/active/x", "music/active/y"] },
      (code) => exits.push(code),
    );
    try {
      process.emit("uncaughtException", new Error("worker 炸了"));
    } finally {
      uninstall();
    }
    expect(exits).toEqual([1]);
    const state = readInterrupted(dir);
    expect(state?.reason).toContain("worker 炸了");
    expect(state?.plans).toEqual(["etf/active/x", "music/active/y"]);
  });

  it("卸载后摘掉监听", async () => {
    const dir = await tempDir();
    const before = process.listenerCount("unhandledRejection");
    const uninstall = installCrashGuard({ directory: () => dir, plans: () => [] }, () => undefined);
    expect(process.listenerCount("unhandledRejection")).toBe(before + 1);
    uninstall();
    expect(process.listenerCount("unhandledRejection")).toBe(before);
  });

  it("多个来源共享同一份监听", async () => {
    const first = await tempDir();
    const second = await tempDir();
    const before = process.listenerCount("uncaughtException");
    const offFirst = installCrashGuard(
      { directory: () => first, plans: () => ["a"] },
      () => undefined,
    );
    const offSecond = installCrashGuard(
      { directory: () => second, plans: () => ["b"] },
      () => undefined,
    );
    expect(process.listenerCount("uncaughtException")).toBe(before + 1);
    offFirst();
    offSecond();
    expect(process.listenerCount("uncaughtException")).toBe(before);
  });
});

describe("超时与错误文本", () => {
  it("超时先收尾再返回 timeout", async () => {
    let aborted = false;
    const never = new Promise<string>(() => undefined);
    const result = await withTimeout(never, 5, () => {
      aborted = true;
    });
    expect(result).toBe("timeout");
    expect(aborted).toBe(true);
  });

  it("未超时返回原结果", async () => {
    expect(await withTimeout(Promise.resolve(7), 1_000, () => undefined)).toBe(7);
  });

  it("describeError 只给一行文本", () => {
    expect(describeError("spawn", new Error("no model"))).toBe("spawn: no model");
    expect(describeError("spawn", "boom")).toBe("spawn: boom");
  });
});
