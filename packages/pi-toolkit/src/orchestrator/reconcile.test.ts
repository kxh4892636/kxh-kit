import { describe, expect, it } from "vite-plus/test";
import type { NoteNode, NoteStatus } from "./dag.ts";
import { formatReconcile, reconcile, type PlanSnapshot } from "./reconcile.ts";

const note = (id: string, status: NoteStatus, needs?: "answer" | "review"): NoteNode => ({
  id,
  title: `note ${id}`,
  description: "摘要",
  status,
  ...(needs === undefined ? {} : { needs }),
  blocked_by: [],
  evidence: [],
  updated_at: "2026-11-07T00:00:00.000Z",
  content: "正文",
});

const snapshot = (planRef: string, notes: NoteNode[]): PlanSnapshot => ({ planRef, notes });

describe("启动对账", () => {
  it("in_progress 判为被打断", () => {
    const items = reconcile([snapshot("etf/active/a", [note("01", "in_progress")])]);
    expect(items).toEqual([
      expect.objectContaining({ kind: "interrupted", planRef: "etf/active/a", note: "01" }),
    ]);
  });

  it("waiting 按 needs 分成回答与验收", () => {
    const items = reconcile([
      snapshot("etf/active/a", [note("01", "waiting", "answer")]),
      snapshot("music/active/b", [note("02", "waiting", "review")]),
    ]);
    expect(items.map((item) => [item.kind, item.needs])).toEqual([
      ["waiting", "answer"],
      ["waiting", "review"],
    ]);
    expect(items[0]?.detail).toContain("等人回答");
    expect(items[1]?.detail).toContain("等验收");
  });

  it("全部 completed 提示可归档", () => {
    const items = reconcile([snapshot("etf/active/a", [note("01", "completed")])]);
    expect(items[0]?.kind).toBe("archive_ready");
  });

  it("没有 note 或只有 pending 归入 unknown", () => {
    const items = reconcile([
      snapshot("etf/active/a", []),
      snapshot("music/active/b", [note("01", "pending")]),
    ]);
    expect(items.map((item) => item.kind)).toEqual(["unknown", "unknown"]);
  });

  it("中断凭据里已不存在的 plan 也报出来", () => {
    const items = reconcile([snapshot("etf/active/a", [note("01", "pending")])], {
      at: "2026-11-07T01:00:00.000Z",
      plans: ["etf/active/a", "gone/active/z"],
    });
    const interrupted = items.filter((item) => item.kind === "interrupted");
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0]?.planRef).toBe("gone/active/z");
    expect(interrupted[0]?.detail).toContain("异常退出");
  });

  it("无待办时不产生消息", () => {
    expect(formatReconcile([])).toBeUndefined();
  });

  it("消息里声明只报告不行动", () => {
    const text = formatReconcile(
      reconcile([snapshot("etf/active/a", [note("01", "in_progress")])]),
    );
    expect(text).toContain("启动对账");
    expect(text).toContain("不要自行重派或归档");
  });
});
