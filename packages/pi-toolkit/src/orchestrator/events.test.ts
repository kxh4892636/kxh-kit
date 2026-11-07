import { describe, expect, it } from "vite-plus/test";
import {
  clipText,
  EVIDENCE_ITEM_MAX,
  EVENT_TYPES,
  formatEvent,
  parseEventLine,
  payloadNumber,
  payloadString,
  payloadStrings,
  SUMMARY_MAX,
  type LedgerEvent,
} from "./events.ts";

describe("事件 schema", () => {
  it("类型集合覆盖账本要用的全部事件", () => {
    expect([...EVENT_TYPES]).toEqual([
      "input.sent",
      "input.consumed",
      "report.filed",
      "note.pass",
      "worker.spawned",
      "worker.exit",
      "worker.suspended",
      "worker.resumed",
      "worker.merge_blocked",
      "worktree.created",
      "worktree.merged",
      "worktree.removed",
      "worktree.leftover",
      "timeout",
      "timeout.diagnosed",
      "retry.scheduled",
      "retry.exhausted",
      "state.pulled",
      "interrupted.forgotten",
      "interrupted.cleared",
      "snapshot",
    ]);
  });

  it("摘要折叠空白并截到上限", () => {
    expect(clipText("  改完了\n\n全部绿  ")).toBe("改完了 全部绿");
    const long = "字".repeat(SUMMARY_MAX + 20);
    const clipped = clipText(long);
    expect(clipped).toHaveLength(SUMMARY_MAX);
    expect(clipped.endsWith("…")).toBe(true);
    expect(EVIDENCE_ITEM_MAX).toBe(200);
  });

  it("一行 JSON 可以原样解回来", () => {
    const event: LedgerEvent = {
      seq: 7,
      at: "2026-11-07T10:00:00.000Z",
      type: "input.sent",
      idem: "dispatch:abc",
      payload: { worker: "/w/p::01", kind: "message", text: "做 01" },
    };
    const parsed = parseEventLine(formatEvent(event));
    expect(parsed).toEqual(event);
    // 序列化必须是一行：追加写靠换行分条。
    expect(formatEvent(event)).not.toContain("\n");
  });

  it("坏行一律跳过，不炸整个重放", () => {
    expect(parseEventLine("")).toBeUndefined();
    expect(parseEventLine("   ")).toBeUndefined();
    expect(parseEventLine("{")).toBeUndefined();
    expect(parseEventLine("null")).toBeUndefined();
    expect(parseEventLine(JSON.stringify({ seq: 1, at: "x" }))).toBeUndefined();
    expect(
      parseEventLine(JSON.stringify({ seq: 0, at: "x", type: "timeout", payload: {} })),
    ).toBeUndefined();
    expect(
      parseEventLine(JSON.stringify({ seq: 1, at: "", type: "timeout", payload: {} })),
    ).toBeUndefined();
    expect(
      parseEventLine(JSON.stringify({ seq: 1, at: "x", type: "unknown", payload: {} })),
    ).toBeUndefined();
    expect(
      parseEventLine(JSON.stringify({ seq: 1, at: "x", type: "timeout", payload: [] })),
    ).toBeUndefined();
  });

  it("可选 idem 空串不落盘", () => {
    const parsed = parseEventLine(
      JSON.stringify({ seq: 1, at: "x", type: "timeout", idem: "", payload: {} }),
    );
    expect(parsed?.idem).toBeUndefined();
  });

  it("payload 取值助手只认对得上类型", () => {
    const payload = { worker: "temp:1", seqOfSent: 3, notes: ["01", 2, "02"] };
    expect(payloadString(payload, "worker")).toBe("temp:1");
    expect(payloadString(payload, "missing")).toBeUndefined();
    expect(payloadNumber(payload, "seqOfSent")).toBe(3);
    expect(payloadNumber(payload, "worker")).toBeUndefined();
    expect(payloadStrings(payload, "notes")).toEqual(["01", "02"]);
    expect(payloadStrings(payload, "worker")).toEqual([]);
  });
});
