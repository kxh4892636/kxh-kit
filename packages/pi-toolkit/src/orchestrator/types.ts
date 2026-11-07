/**
 * 编排层的数据契约：worker 上报的报告、编排方下发的输入与句柄表的条目。
 * 这里只有类型，没有行为，便于两侧共享而不引入循环依赖。
 * @module @kxh4892636/pi-toolkit/orchestrator/types
 */

/** worker 上报的结论；`done` 只用于进展播报，不代表验收通过。 */
export const REPORT_OUTCOMES = [
  "done",
  "needs_answer",
  "needs_review",
  "blocked",
  "failed",
] as const;

/** worker 上报的结论类型。 */
export type ReportOutcome = (typeof REPORT_OUTCOMES)[number];

/** worker 的一次结构化上报。 */
export interface WorkerReport {
  readonly outcome: ReportOutcome;
  /** 这条 report 针对的 note id。 */
  readonly note: string;
  /** 一句话摘要，直接给人看。**上限 120 码元**（超出写账本时会被截断）。 */
  readonly summary: string;
  /** summary 的原始长度（码元）；由 `orchestrator_report` 在超限时补上。 */
  readonly summaryLength?: number;
  /** summary 是否超出 120 码元（true 时账本里的正文已截断，长内容应在 note evidence 里）。 */
  readonly summaryTruncated?: boolean;
  /** `needs_answer` 时必填。 */
  readonly question?: string;
  /** 已产出的证据；`needs_review` 时建议给出。 */
  readonly evidence?: readonly string[];
  /** 由桥接层补齐：路由键 —— plan 目录的绝对路径，或临时 worker 的 `temp:<id>`。 */
  readonly plan?: string;
  /** worker 自己的账本路由键（`<plan 目录>::<组>` 或 `temp:<id>`），归属判定用它。 */
  readonly worker?: string;
  /** 由桥接层补齐：上报时刻。 */
  readonly at?: string;
}

/** 编排方下发给 worker 的输入种类。 */
export const INPUT_KINDS = ["message", "pass", "rework", "answer", "fact"] as const;

/** 输入种类类型。 */
export type InputKind = (typeof INPUT_KINDS)[number];

/** 一条下发给 worker 的输入；`message` 是首次派活或普通追加。 */
export interface InputMessage {
  readonly kind: InputKind;
  /** `pass` / `rework` 针对的 note id。 */
  readonly note?: string;
  readonly text: string;
}

/** 句柄表里的一个 live worker。 */
export interface WorkerHandle {
  /** plan 目录绝对路径，也是句柄表的键。 */
  readonly planDirectory: string;
  /** `<domain>/<lifecycle>/<name>`，临时 worker 为 `temp:<id>`。 */
  readonly planRef: string;
  /** 起点时刻（毫秒）。 */
  readonly startedAt: number;
  /** 最近一次上报。 */
  readonly lastReport?: WorkerReport;
  /** 下发的次数，用于状态展示。 */
  readonly inputs: number;
}
