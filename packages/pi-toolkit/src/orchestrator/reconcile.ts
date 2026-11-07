/**
 * 启动对账。
 *
 * `orchestrator` 是用户正在用的 TUI 会话，关掉再开就丢掉了"哪些 plan 在跑"这层
 * 记忆。对账把磁盘上的事实重新摆到人面前：哪些被打断、哪些在等人、哪些可以归档。
 * 它**只产出提示，不采取行动** —— 重派 worker、归档、改状态都由人决定。
 * @module @kxh4892636/pi-toolkit/orchestrator/reconcile
 */

import type { NoteNode } from "./dag.ts";
import type { ReconcileItem } from "./types.ts";

/** 对账输入：一个 plan 的引用与它的 note。 */
export interface PlanSnapshot {
  readonly planRef: string;
  readonly notes: readonly NoteNode[];
}

/** 对账输入里的中断凭据（可选）。 */
export interface InterruptSnapshot {
  readonly at: string;
  readonly plans: readonly string[];
}

/**
 * 把 plan 快照分成四类。
 *
 * 判定顺序：有 `in_progress` 视为被打断（worker 已不在），其次 `waiting` 视为等人，
 * 其次全部 `completed` 视为可归档，其余（无 note 或只有 pending）归入 unknown。
 * @param snapshots - 各 active plan 的快照。
 * @param interrupted - 上次崩溃留下的中断凭据。
 * @returns 对账项；没有需要人处理的项时为空数组。
 */
export const reconcile = (
  snapshots: readonly PlanSnapshot[],
  interrupted?: InterruptSnapshot,
): readonly ReconcileItem[] => {
  const items: ReconcileItem[] = [];
  const known = new Set(snapshots.map((snapshot) => snapshot.planRef));

  for (const snapshot of snapshots) {
    const { planRef, notes } = snapshot;
    const running = notes.filter((note) => note.status === "in_progress");
    if (running.length > 0) {
      const first = running[0];
      items.push({
        kind: "interrupted",
        planRef,
        ...(first === undefined ? {} : { note: first.id }),
        detail: `${running.length} 条 note 停在 in_progress：worker 已不在，需要重新派工或人工接手`,
      });
      continue;
    }
    const waiting = notes.filter((note) => note.status === "waiting");
    if (waiting.length > 0) {
      const first = waiting[0];
      const needs = first?.needs ?? "review";
      items.push({
        kind: "waiting",
        planRef,
        needs,
        ...(first === undefined ? {} : { note: first.id }),
        detail:
          needs === "answer"
            ? `${waiting.length} 条 note 在等人回答（needs=answer）`
            : `${waiting.length} 条 note 在等验收（needs=review）`,
      });
      continue;
    }
    if (notes.length > 0 && notes.every((note) => note.status === "completed")) {
      items.push({
        kind: "archive_ready",
        planRef,
        detail: "全部 note 已完成；确认参考价值后可 move 到 reference 或 archived",
      });
      continue;
    }
    items.push({
      kind: "unknown",
      planRef,
      detail:
        notes.length === 0
          ? "Plan 还没有 note；确认是否继续这个 Plan"
          : "只有 pending note；说明要推进哪一条",
    });
  }

  for (const planRef of interrupted?.plans ?? []) {
    if (known.has(planRef)) continue;
    items.push({
      kind: "interrupted",
      planRef,
      detail: `上次进程异常退出时仍在跑（${interrupted?.at ?? "时间未知"}），plan 已不存在或已归档`,
    });
  }
  return items;
};

/**
 * 把对账项渲染成一条给编排方看的消息。
 * @param items - 对账项。
 * @returns 多行文本；为空时返回 undefined。
 */
export const formatReconcile = (items: readonly ReconcileItem[]): string | undefined => {
  if (items.length === 0) return undefined;
  const lines = [`启动对账：${items.length} 个 Plan 需要你确认`];
  for (const item of items) {
    const note = item.note === undefined ? "" : ` · note ${item.note}`;
    lines.push(`- [${item.kind}] ${item.planRef}${note} — ${item.detail}`);
  }
  lines.push("先向用户如实报告，不要自行重派或归档。");
  return lines.join("\n");
};
