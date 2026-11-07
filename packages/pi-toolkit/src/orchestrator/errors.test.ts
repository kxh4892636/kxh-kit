import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { describeError, installCrashGuard, stateDirectory } from "./errors.ts";

const created: string[] = [];

afterEach(() => {
  created.splice(0);
});

describe("状态目录", () => {
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

  it("卸载后摘掉监听", () => {
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
