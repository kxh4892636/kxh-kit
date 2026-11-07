import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  clearInterrupted,
  describeError,
  forgetInterruptedPlan,
  installCrashGuard,
  readInterrupted,
  stateDirectory,
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

  it("按 plan 移除条目：剩下的重写回文件", async () => {
    const dir = await tempDir();
    writeInterrupted(dir, {
      at: "2026-11-07T00:00:00.000Z",
      reason: "boom",
      plans: ["etf/active/x", "music/active/y"],
    });
    forgetInterruptedPlan(dir, "etf/active/x");
    expect(readInterrupted(dir)).toEqual({
      at: "2026-11-07T00:00:00.000Z",
      reason: "boom",
      plans: ["music/active/y"],
    });
  });

  it("按 plan 移除最后一条时删掉整档", async () => {
    const dir = await tempDir();
    writeInterrupted(dir, {
      at: "2026-11-07T00:00:00.000Z",
      reason: "boom",
      plans: ["etf/active/x"],
    });
    forgetInterruptedPlan(dir, "etf/active/x");
    expect(readInterrupted(dir)).toBeUndefined();
  });

  it("未命中或没有凭据时不写文件", async () => {
    const dir = await tempDir();
    forgetInterruptedPlan(dir, "etf/active/x");
    expect(readInterrupted(dir)).toBeUndefined();
    writeInterrupted(dir, {
      at: "2026-11-07T00:00:00.000Z",
      reason: "boom",
      plans: ["etf/active/x"],
    });
    forgetInterruptedPlan(dir, "music/active/y");
    expect(readInterrupted(dir)?.plans).toEqual(["etf/active/x"]);
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
  it("崩溃时落凭据并以非零码退出", () => {
    const exits: number[] = [];
    const reasons: string[] = [];
    const uninstall = installCrashGuard({ record: (reason) => reasons.push(reason) }, (code) =>
      exits.push(code),
    );
    try {
      process.emit("uncaughtException", new Error("worker 炸了"));
    } finally {
      uninstall();
    }
    expect(exits).toEqual([1]);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("worker 炸了");
  });

  it("卸载后摘掉监听", async () => {
    const before = process.listenerCount("unhandledRejection");
    const uninstall = installCrashGuard({ record: () => undefined }, () => undefined);
    expect(process.listenerCount("unhandledRejection")).toBe(before + 1);
    uninstall();
    expect(process.listenerCount("unhandledRejection")).toBe(before);
  });

  it("多个来源共享同一份监听", async () => {
    const before = process.listenerCount("uncaughtException");
    const offFirst = installCrashGuard({ record: () => undefined }, () => undefined);
    const offSecond = installCrashGuard({ record: () => undefined }, () => undefined);
    expect(process.listenerCount("uncaughtException")).toBe(before + 1);
    offFirst();
    offSecond();
    expect(process.listenerCount("uncaughtException")).toBe(before);
  });
});

describe("错误文本", () => {
  it("describeError 只给一行文本", () => {
    expect(describeError("spawn", new Error("no model"))).toBe("spawn: no model");
    expect(describeError("spawn", "boom")).toBe("spawn: boom");
  });
});
