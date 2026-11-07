import { describe, expect, it } from "vite-plus/test";
import { createOutbox, type OutboxSendOptions } from "./outbox.ts";

/** 记录每次投递；`failNext` 控制接下来几次抛错。 */
const recorder = () => {
  const calls: Array<{ customType: string; options: OutboxSendOptions }> = [];
  let failNext = 0;
  const send = (
    message: { customType: string; content: string; display: boolean; details?: unknown },
    options: OutboxSendOptions,
  ): void => {
    if (failNext > 0) {
      failNext -= 1;
      throw new Error("会话正在关闭");
    }
    calls.push({ customType: message.customType, options });
  };
  return {
    calls,
    send,
    failTimes(times: number) {
      failNext = times;
    },
  };
};

describe("通知队列", () => {
  it("空闲走 steer + triggerTurn，忙时走 followUp", () => {
    const fake = recorder();
    const outbox = createOutbox(fake.send);

    outbox.submit({ customType: "orchestrator-report", content: "上报" }, false);
    expect(fake.calls[0]?.options).toEqual({ triggerTurn: true, deliverAs: "steer" });

    outbox.submit({ customType: "orchestrator-report", content: "上报" }, true);
    expect(fake.calls[1]?.options).toEqual({ deliverAs: "followUp" });
    expect(outbox.count()).toBe(0);
  });

  it("投递失败不抛错、计数 +1、入队，并在重试成功后归零", () => {
    const fake = recorder();
    const outbox = createOutbox(fake.send);
    fake.failTimes(1);

    expect(() =>
      outbox.submit({ customType: "orchestrator-report", content: "上报" }, false),
    ).not.toThrow();
    expect(outbox.count()).toBe(1);
    expect(outbox.lastError()).toBe("会话正在关闭");
    expect(fake.calls).toHaveLength(0);

    // 下一次可注入的时机重试：第二次真的送出去了，队列出清。
    expect(outbox.retry(false)).toBe(1);
    expect(outbox.count()).toBe(0);
    expect(fake.calls).toHaveLength(1);
  });

  it("重试仍失败就留在队里，不越过队头", () => {
    const fake = recorder();
    const outbox = createOutbox(fake.send);
    fake.failTimes(2);
    outbox.submit({ customType: "orchestrator-report", content: "第一条", planRef: "a" }, true);
    outbox.submit({ customType: "orchestrator-report", content: "第二条", planRef: "b" }, true);
    expect(outbox.count()).toBe(2);
    expect(outbox.countFor("a")).toBe(1);
    expect(outbox.countFor("b")).toBe(1);

    // 队头仍失败就停手，不越过它先送第二条。
    fake.failTimes(1);
    expect(outbox.retry(true)).toBe(0);
    expect(outbox.count()).toBe(2);
    expect(outbox.list()[0]?.content).toBe("第一条");

    // 放通后按顺序出队（两条都是忙时投递）。
    expect(outbox.retry(true)).toBe(2);
    expect(outbox.count()).toBe(0);
    expect(fake.calls.map((call) => call.options.deliverAs)).toEqual(["followUp", "followUp"]);
  });

  it("按 worker 计数用于清单展示，积压时记录尝试次数", () => {
    const fake = recorder();
    const outbox = createOutbox(fake.send);
    fake.failTimes(5);
    outbox.submit(
      { customType: "orchestrator-worker-timeout", content: "超时", planRef: "pi/active/p" },
      true,
    );
    outbox.retry(true);
    outbox.retry(true);
    expect(outbox.countFor("pi/active/p")).toBe(1);
    expect(outbox.countFor("别处")).toBe(0);
    const [notice] = outbox.list();
    expect(notice?.attempts).toBe(3);
    expect(notice?.customType).toBe("orchestrator-worker-timeout");
  });
});
