/**
 * history-text 单元测试: 事件正文取法与摘要边界(host.read 的行为测试覆盖集成路径)。
 */
import { describe, expect, it } from "vitest";
import { entriesOf, eventTextOf } from "./history-text.ts";
import type { RuntimeHistoryRecordLike } from "./host/host-contract.ts";

const recordOf = (type: string, seq: number, data: unknown): RuntimeHistoryRecordLike => ({
  type: "event",
  event: { type, seq, time: seq, data },
});

describe("eventTextOf", () => {
  it("取顶层 content、message.content 与裸 text", () => {
    expect(eventTextOf({ content: [{ type: "text", text: "用户" }] })).toBe("用户");
    expect(eventTextOf({ message: { content: [{ type: "text", text: "助手" }] } })).toBe("助手");
    expect(eventTextOf({ text: "兜底" })).toBe("兜底");
  });

  it("递归取 tool-result 块内层正文", () => {
    expect(
      eventTextOf({
        message: {
          content: [
            {
              type: "tool-result",
              toolCallId: "c1",
              content: [{ type: "text", text: "结果" }],
            },
          ],
        },
      }),
    ).toBe("结果");
  });

  it("跳过 reasoning 块与非文本块", () => {
    expect(
      eventTextOf({
        content: [
          { type: "reasoning", text: "推理" },
          { type: "image" },
          { type: "text", text: "正文" },
        ],
      }),
    ).toBe("正文");
  });
});

describe("entriesOf 摘要边界", () => {
  it("工具参数按码点截断且不切断 emoji", () => {
    const args = `"${"🙂".repeat(100)}"`;
    const [entry] = entriesOf([recordOf("tool/call", 1, { name: "t", arguments: args })]);
    expect(entry?.text.startsWith("[tool/call] t(")).toBe(true);
    expect(entry?.text.endsWith("…)")).toBe(true);
    expect(entry?.text).not.toContain("\uFFFD");
  });

  it("工具调用无参数时只留 name()", () => {
    const [entry] = entriesOf([recordOf("tool/call", 1, { name: "t" })]);
    expect(entry?.text).toBe("[tool/call] t()");
  });

  it("chunks 变体不产生条目", () => {
    const legacy = {
      type: "chunks",
      event: { type: "chunkrow/text-chunks", seq: 1, time: 1, data: { texts: ["x"] } },
    } as unknown as RuntimeHistoryRecordLike;
    expect(entriesOf([legacy])).toEqual([]);
  });
});
