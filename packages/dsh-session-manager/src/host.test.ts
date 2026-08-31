/**
 * SessionManagerHost 行为测试: 列表/读取/派生/投递/模型/归档/等待/错误归一化。
 */
import { describe, expect, it } from "vitest";
import {
  HOST_UNEXPECTED_CODE,
  HostError,
  SessionManagerHost,
  normalizeHostError,
  resolveSpawnLocation,
  subagentModeOf,
} from "./host.ts";
import type { HostServices } from "./host.ts";
import { headerOf, makeFakeServices, messageRecordOf, snapshotOf } from "./test-support.ts";

const makeHost = (
  options?: Parameters<typeof makeFakeServices>[0],
): {
  readonly host: SessionManagerHost;
  readonly calls: ReturnType<typeof makeFakeServices>["calls"];
} => {
  const fake = makeFakeServices(options);
  return { host: new SessionManagerHost(fake.services), calls: fake.calls };
};

describe("normalizeHostError", () => {
  it("保留 RemoteError 子集的 code", () => {
    const error = normalizeHostError({ code: "session/not-found", message: "no such session" });
    expect(error).toBeInstanceOf(HostError);
    expect(error.code).toBe("session/not-found");
    expect(error.message).toContain("no such session");
  });

  it("一般 Error 落入 gateway/internal", () => {
    const error = normalizeHostError(new Error("boom"));
    expect(error.code).toBe("gateway/internal");
  });

  it("非 Error 抛出一律落到固定 code", () => {
    const error = normalizeHostError("weird");
    expect(error.code).toBe(HOST_UNEXPECTED_CODE);
  });

  it("HostError 原样返回", () => {
    const original = new HostError("SESSION_MANAGER_TIMEOUT", "timeout");
    expect(normalizeHostError(original)).toBe(original);
  });
});

describe("subagentModeOf", () => {
  it("从 projection 值解析 continuable/one-shot", () => {
    expect(subagentModeOf({ subagent: { identity: { mode: "continuable" } } })).toBe("continuable");
    expect(subagentModeOf({ subagent: { identity: { mode: "one-shot" } } })).toBe("one-shot");
  });

  it("缺失或畸形返回 undefined", () => {
    expect(subagentModeOf(undefined)).toBeUndefined();
    expect(subagentModeOf({ subagent: { identity: {} } })).toBeUndefined();
    expect(subagentModeOf({ subagent: null })).toBeUndefined();
    expect(subagentModeOf({ subagent: { identity: { mode: "unknown" } } })).toBeUndefined();
  });
});

describe("list", () => {
  const options = {
    items: [
      { sessionId: "session-a", updatedAt: 30, title: "A", cwd: "C:\\ws-a", running: true },
      {
        sessionId: "session-b",
        updatedAt: 20,
        title: "B",
        cwd: "C:\\ws-a",
        origin: "subagent" as const,
        parentSessionId: "session-a",
      },
      { sessionId: "session-c", updatedAt: 10, title: "C", cwd: "C:\\ws-b" },
    ],
    workspaces: [
      { id: "ws-1", path: "C:\\ws-a", title: "WS-A" },
      { id: "ws-2", path: "C:\\ws-b", title: "WS-B" },
    ],
    archived: ["session-c"],
  };

  it("默认隐藏归档, 附 workspace 归属与投影标题", async () => {
    const { host } = makeHost(options);
    const items = await host.list(false);
    expect(items.map((item) => item.sessionId)).toEqual(["session-a", "session-b"]);
    const a = items[0];
    expect(a).toMatchObject({
      archived: false,
      workspaceId: "ws-1",
      workspaceTitle: "WS-A",
      title: "A",
      running: true,
    });
    expect(items[1]?.parentSessionId).toBe("session-a");
  });

  it("includeArchived 恢复归档显示", async () => {
    const { host } = makeHost(options);
    const items = await host.list(true);
    expect(items.map((item) => item.sessionId)).toContain("session-c");
    expect(items.find((item) => item.sessionId === "session-c")).toMatchObject({
      archived: true,
      workspaceId: "ws-2",
    });
  });

  it("无 cwd 的会话不挂 workspace 且不激活", async () => {
    const { host } = makeHost({ items: [{ sessionId: "session-x", updatedAt: 1, title: "X" }] });
    const items = await host.list(true);
    expect(items[0]).not.toHaveProperty("cwd");
    expect(items[0]).not.toHaveProperty("workspaceId");
    expect(items[0]).not.toHaveProperty("workspaceTitle");
  });
});

describe("read", () => {
  const frames = [
    snapshotOf(
      [
        messageRecordOf("user/message", 1, "hello"),
        messageRecordOf("assistant/message", 2, "hi there"),
        { type: "event", event: { type: "turn/end", seq: 3, time: 5, data: {} } },
      ],
      300,
      true,
      headerOf("session-a", { cwd: "C:\\ws" }),
    ),
  ];

  it("快照窗口: 消息对齐 + 摘要行 + 游标", async () => {
    const { host } = makeHost({ frames });
    const window = await host.read({ sessionId: "session-a" });
    expect(window.throughSeq).toBe(300);
    expect(window.hasMore).toBe(true);
    expect(window.entries.map((entry) => [entry.kind, entry.text])).toEqual([
      ["user", "hello"],
      ["assistant", "hi there"],
      ["event", "[event turn/end]"],
    ]);
    expect(window.header.cwd).toBe("C:\\ws");
  });

  it("事件文本: chunk 行展开为 assistant 文本('chunks' 与 'event' 双 wire 形状)+ 后备 text 字段", async () => {
    const { host } = makeHost({
      frames: [
        snapshotOf([
          {
            type: "chunks",
            event: {
              type: "chunkrow/text-chunks",
              seq: 6,
              time: 6,
              data: { seq: 45, turn: 1, step: 1, index: 0, dt: [], texts: ["SMOKE-", "OK"] },
            },
          },
          {
            type: "event",
            event: {
              type: "chunkrow/text-chunks",
              seq: 7,
              time: 7,
              data: { seq: 46, turn: 1, step: 1, index: 0, dt: [], texts: ["SECOND-", "REPLY"] },
            },
          },
          {
            type: "event",
            event: {
              type: "chunkrow/reasoning-chunks",
              seq: 8,
              time: 8,
              data: { texts: ["thinking"] },
            },
          },
          {
            type: "event",
            event: { type: "user/message", seq: 9, time: 9, data: { text: "plain text" } },
          },
          {
            type: "event",
            event: {
              type: "user/message",
              seq: 10,
              time: 10,
              data: { content: [{ type: "text", text: "a" }, { type: "image" }] },
            },
          },
        ]),
      ],
    });
    const window = await host.read({ sessionId: "session-a" });
    expect(window.entries.map((entry) => [entry.kind, entry.text])).toEqual([
      ["assistant", "SMOKE-OK"],
      ["assistant", "SECOND-REPLY"],
      ["event", "[chunk 增量行 chunkrow/reasoning-chunks]"],
      ["user", "plain text"],
      ["user", "a"],
    ]);
  });

  it("无 opening snapshot 时抛出读取失败", async () => {
    const { host } = makeHost({ frames: [] });
    await expect(host.read({ sessionId: "session-a" })).rejects.toMatchObject({
      code: "SESSION_MANAGER_READ_FAILED",
    });
  });

  it("beforeSeq 时以快照 throughSeq 向前翻页", async () => {
    const { host, calls } = makeHost({
      frames,
      pageRecords: [messageRecordOf("user/message", 5, "older")],
      pageHasMore: true,
    });
    const window = await host.read({ sessionId: "session-a" }, { beforeSeq: 300, maxMessages: 4 });
    expect(calls.page).toHaveLength(1);
    expect(calls.page[0]).toMatchObject({
      address: { kind: "session", sessionId: "session-a" },
      throughSeq: 300,
      beforeSeq: 300,
      maxMessages: 4,
    });
    expect(window.entries[0]?.text).toBe("older");
    expect(window.hasMore).toBe(true);
  });

  it("子会话寻址: 投影给出 mode 时用 subagent 地址", async () => {
    const { host, calls } = makeHost({
      frames,
      subagentMode: "continuable",
      items: [{ sessionId: "child-1", origin: "subagent", parentSessionId: "parent-1" }],
    });
    await host.read({ sessionId: "child-1", parentSessionId: "parent-1" });
    expect(calls.follow[0]).toMatchObject({
      address: {
        kind: "subagent",
        parentSessionId: "parent-1",
        childSessionId: "child-1",
        mode: "continuable",
      },
    });
  });

  it("子会话寻址: 投影不可用时给出明确错误", async () => {
    const { host } = makeHost({
      frames,
      items: [{ sessionId: "child-1", origin: "subagent", parentSessionId: "parent-1" }],
    });
    await expect(
      host.read({ sessionId: "child-1", parentSessionId: "parent-1" }),
    ).rejects.toMatchObject({ code: "SESSION_MANAGER_SUBAGENT_UNAVAILABLE" });
  });
});

describe("spawn / prompt / select / rename / archive", () => {
  it("spawn 只创建时不触发 selectModel", async () => {
    const { host, calls } = makeHost();
    const result = await host.spawn({ cwd: "C:\\ws" });
    expect(result.sessionId).toBe("session-new-1");
    expect(calls.create[0]).toMatchObject({ cwd: "C:\\ws" });
    expect(calls.selectModel).toHaveLength(0);
  });

  it("resolveSpawnLocation: 显式参数透传, 省略返回空", () => {
    expect(resolveSpawnLocation({ workspaceId: "ws-1" })).toEqual({ workspaceId: "ws-1" });
    expect(resolveSpawnLocation({ cwd: "C:\\ws" })).toEqual({ cwd: "C:\\ws" });
    expect(resolveSpawnLocation({})).toEqual({});
    expect(resolveSpawnLocation({ workspaceId: "ws-1", cwd: "C:\\ws" })).toEqual({
      workspaceId: "ws-1",
      cwd: "C:\\ws",
    });
  });

  it("spawn 全部省略时落位为空(行为不变)", async () => {
    const { host, calls } = makeHost();
    await host.spawn({});
    expect(calls.create[0]).toEqual({});
  });

  it("context 注入钩子: 有 installer 且 context 非空时调用; 否则跳过", async () => {
    const fake = makeFakeServices();
    const installed: Array<{ sessionId: string; context: string }> = [];
    const host = new SessionManagerHost(fake.services, {
      contextInstaller: async (sessionId, context) => {
        installed.push({ sessionId, context });
      },
    });
    await host.spawn({ context: "自定义上下文" });
    expect(installed).toEqual([{ sessionId: "session-new-1", context: "自定义上下文" }]);
    await host.spawn({});
    expect(installed).toHaveLength(1);
  });

  it("spawn 带模型时创建后 selectModel", async () => {
    const { host, calls } = makeHost();
    await host.spawn({ sessionId: "session-x", provider: "p", model: "m", reasoningEffort: "max" });
    expect(calls.selectModel[0]).toEqual({
      sessionId: "session-new-1",
      provider: "p",
      model: "m",
      reasoningEffort: "max",
    });
  });

  it("prompt mint requestId 并透传 mode/内容", async () => {
    const { host, calls } = makeHost();
    const result = await host.prompt({ sessionId: "session-a", text: "继续", mode: "queue" });
    expect(result).toEqual({ accepted: true });
    const request = calls.prompt[0] as {
      readonly requestId: string;
      readonly mode: string;
      readonly content: readonly { readonly type: string; readonly text: string }[];
    };
    expect(request.mode).toBe("queue");
    expect(request.content).toEqual([{ type: "text", text: "继续" }]);
    expect(request.requestId.length).toBeGreaterThan(0);
  });

  it("modelList 归一化模型条目与推理档位", async () => {
    const { host } = makeHost({ catalogModels: ["deepseek-v4-flash", "deepseek-v4-pro"] });
    const catalog = await host.modelList();
    const group = catalog.groups[0];
    expect(catalog.default.provider).toBe("deepseek-official");
    expect(group?.models.map((model) => model.id)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
    expect(group?.models[1]?.description).toBe("pro");
  });

  it("modelList 透传推理档位与失败隔离", async () => {
    const fake = makeFakeServices();
    const services: HostServices = {
      ...fake.services,
      sessionController: {
        ...fake.services.sessionController,
        modelCatalog: async () => ({
          default: { provider: "p", model: "m" },
          routableProviders: ["p", "bad"],
          groups: [
            {
              id: "p",
              name: "P",
              models: [
                {
                  id: "m",
                  name: "M",
                  reasoning: {
                    efforts: [
                      { id: "max", name: "Max", description: "maximum" },
                      { id: "low", name: "Low" },
                    ],
                    defaultEffort: "max",
                  },
                },
              ],
            },
          ],
          failures: [{ id: "bad", name: "Bad", message: "nope" }],
        }),
      },
    };
    const catalog = await new SessionManagerHost(services).modelList();
    const model = catalog.groups[0]?.models[0];
    expect(model?.reasoning).toEqual({
      efforts: [
        { id: "max", name: "Max", description: "maximum" },
        { id: "low", name: "Low" },
      ],
      defaultEffort: "max",
    });
    expect(catalog.failures[0]?.message).toBe("nope");
  });

  it("selectModel/rename/archive 透传", async () => {
    const { host, calls } = makeHost();
    const selected = await host.selectModel({ sessionId: "session-a", provider: "p", model: "m" });
    expect(selected).toEqual({ selected: { provider: "p", model: "m" } });
    await host.rename({ sessionId: "session-a", title: "x" });
    expect(calls.rename[0]).toEqual({ sessionId: "session-a", title: "x" });
    await host.archive("session-a");
    expect(calls.archive).toEqual(["session-a"]);
  });
});

describe("wait", () => {
  it("轮询直到 running=false 并返回最终条目", async () => {
    const fake = makeFakeServices();
    let polled = 0;
    const services: HostServices = {
      ...fake.services,
      sessionController: {
        ...fake.services.sessionController,
        list: async () => {
          polled++;
          return {
            items: [
              {
                sessionId: "session-a",
                updatedAt: 1,
                running: polled < 3,
                blank: false,
                title: "A",
              },
            ],
          };
        },
      },
    };
    const entry = await new SessionManagerHost(services).wait({
      sessionId: "session-a",
      timeoutMs: 500,
      pollIntervalMs: 1,
    });
    expect(entry.running).toBe(false);
    expect(polled).toBe(3);
  });

  it("超时抛出 SESSION_MANAGER_TIMEOUT", async () => {
    const { host } = makeHost({ items: [{ sessionId: "session-a", running: true }] });
    await expect(
      host.wait({ sessionId: "session-a", timeoutMs: 30, pollIntervalMs: 5 }),
    ).rejects.toMatchObject({ code: "SESSION_MANAGER_TIMEOUT" });
  });
});
