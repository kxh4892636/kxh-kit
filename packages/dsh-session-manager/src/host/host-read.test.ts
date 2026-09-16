/**
 * 读取窗口测试: 文本化按真实 wire 形状取正文, 子会话寻址按投影解析 mode。
 *
 * 假数据形状对齐宿主 0.1.5-rc.1: `user/message` 的块在 `data.content`,
 * `assistant/message` 与 `tool/result` 在 `data.message.content`
 * (`tool/result` 的正文嵌在 `tool-result` 块的内层 `content`)。
 */
import { describe, expect, it } from "vitest";
import { SessionManagerHost } from "./host.ts";
import type { RuntimeHistoryRecordLike } from "./host-contract.ts";
import {
  headerOf,
  makeFakeServices,
  makeHost,
  messageRecordOf,
  snapshotOf,
} from "../testing/test-support.ts";

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

  it("assistant 正文取自 data.message.content(0.1.5-rc.1 wire 形状)", async () => {
    const { host } = makeHost({
      frames: [
        snapshotOf([
          messageRecordOf("user/message", 1, "你好"),
          messageRecordOf("assistant/message", 2, "回答正文"),
        ]),
      ],
    });
    const window = await host.read({ sessionId: "session-a" });
    expect(window.entries.map((entry) => [entry.kind, entry.text])).toEqual([
      ["user", "你好"],
      ["assistant", "回答正文"],
    ]);
  });

  it("assistant 正文: 多块以换行相接, reasoning 块不计入", async () => {
    const { host } = makeHost({
      frames: [
        snapshotOf([
          {
            type: "event",
            event: {
              type: "assistant/message",
              seq: 2,
              time: 2,
              data: {
                turn: 1,
                step: 1,
                message: {
                  role: "assistant",
                  content: [
                    { type: "reasoning", text: "内部推理" },
                    { type: "text", text: " 甲 " },
                    { type: "text", text: "乙" },
                  ],
                },
              },
            },
          },
        ]),
      ],
    });
    const window = await host.read({ sessionId: "session-a" });
    expect(window.entries.map((entry) => [entry.kind, entry.text])).toEqual([
      ["assistant", "甲\n乙"],
    ]);
  });

  it("assistant 空正文不入窗口", async () => {
    const { host } = makeHost({
      frames: [
        snapshotOf([
          { type: "event", event: { type: "assistant/message", seq: 1, time: 1, data: {} } },
          { type: "event", event: { type: "turn/end", seq: 2, time: 2, data: {} } },
        ]),
      ],
    });
    const window = await host.read({ sessionId: "session-a" });
    expect(window.entries.map((entry) => [entry.kind, entry.text])).toEqual([
      ["event", "[event turn/end]"],
    ]);
  });

  it("工具事件: tool/call 带参数摘要, tool/result 正文取自嵌套 tool-result 块", async () => {
    const { host } = makeHost({
      frames: [
        snapshotOf([
          {
            type: "event",
            event: {
              type: "tool/call",
              seq: 1,
              time: 1,
              data: { turn: 1, step: 1, callId: "c1", name: "session_read", arguments: '{"a":1}' },
            },
          },
          {
            type: "event",
            event: {
              type: "tool/result",
              seq: 2,
              time: 2,
              data: {
                turn: 1,
                step: 1,
                message: {
                  role: "user",
                  content: [
                    {
                      type: "tool-result",
                      toolCallId: "c1",
                      content: [{ type: "text", text: "第一行\n第二行" }],
                    },
                  ],
                },
              },
            },
          },
        ]),
      ],
    });
    const window = await host.read({ sessionId: "session-a" });
    expect(window.entries.map((entry) => [entry.kind, entry.text])).toEqual([
      ["event", '[tool/call] session_read({"a":1})'],
      ["event", "[tool/result] 第一行"],
    ]);
  });

  it("工具结果: 带 error 的失败结果在正文后附错误身份", async () => {
    const { host } = makeHost({
      frames: [
        snapshotOf([
          {
            type: "event",
            event: {
              type: "tool/result",
              seq: 1,
              time: 1,
              data: {
                turn: 1,
                step: 1,
                message: {
                  role: "user",
                  content: [
                    {
                      type: "tool-result",
                      toolCallId: "c1",
                      content: [{ type: "text", text: "读取失败" }],
                      isError: true,
                    },
                  ],
                },
                error: { name: "ToolError", code: "E_FAIL" },
              },
            },
          },
        ]),
      ],
    });
    const window = await host.read({ sessionId: "session-a" });
    expect(window.entries.map((entry) => entry.text)).toEqual([
      "[tool/result] 读取失败 error ToolError E_FAIL",
    ]);
  });

  it("兜底形状: 顶层 content 与裸 text 字段仍可读", async () => {
    const { host } = makeHost({
      frames: [
        snapshotOf([
          {
            type: "event",
            event: {
              type: "user/message",
              seq: 1,
              time: 1,
              data: { content: [{ type: "text", text: "a" }, { type: "image" }] },
            },
          },
          {
            type: "event",
            event: { type: "user/message", seq: 2, time: 2, data: { text: "plain text" } },
          },
        ]),
      ],
    });
    const window = await host.read({ sessionId: "session-a" });
    expect(window.entries.map((entry) => [entry.kind, entry.text])).toEqual([
      ["user", "a"],
      ["user", "plain text"],
    ]);
  });

  it("已移除的 'chunks' 变体不再参与文本化", async () => {
    const legacy = {
      type: "chunks",
      event: {
        type: "chunkrow/text-chunks",
        seq: 1,
        time: 1,
        data: { texts: ["SMOKE-", "OK"] },
      },
    } as unknown as RuntimeHistoryRecordLike;
    const { host } = makeHost({
      frames: [
        snapshotOf([
          legacy,
          {
            type: "event",
            event: { type: "turn/end", seq: 2, time: 2, data: {} },
          },
        ]),
      ],
    });
    const window = await host.read({ sessionId: "session-a" });
    expect(window.entries.map((entry) => [entry.kind, entry.text])).toEqual([
      ["event", "[event turn/end]"],
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

  it("子会话寻址: live 投影按 (session, key) 调用并优先于冷查询", async () => {
    const fake = makeFakeServices({
      frames,
      items: [{ sessionId: "child-1", origin: "subagent", parentSessionId: "parent-1" }],
    });
    const seen: unknown[] = [];
    const host = new SessionManagerHost({
      ...fake.services,
      sessionProjections: {
        stateOf: (session, key) => {
          seen.push([session, key]);
          return key === "subagent" ? { identity: { mode: "continuable" } } : undefined;
        },
      },
    });
    await host.read({ sessionId: "child-1", parentSessionId: "parent-1" });
    expect(seen).toEqual([[expect.objectContaining({ sessionId: "child-1" }), "subagent"]]);
    expect(fake.calls.follow[0]).toMatchObject({ address: { mode: "continuable" } });
    expect(fake.calls.observe).toHaveLength(0);
  });

  it("子会话寻址: live 未命中时经冷查询解析 mode", async () => {
    const fake = makeFakeServices({
      frames,
      subagentMode: "one-shot",
      items: [{ sessionId: "child-1", origin: "subagent", parentSessionId: "parent-1" }],
    });
    const host = new SessionManagerHost({
      ...fake.services,
      sessionProjections: { stateOf: () => undefined },
    });
    await host.read({ sessionId: "child-1", parentSessionId: "parent-1" });
    expect(fake.calls.observe).toEqual(["child-1"]);
    expect(fake.calls.follow[0]).toMatchObject({ address: { mode: "one-shot" } });
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
