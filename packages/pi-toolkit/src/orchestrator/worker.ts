/**
 * worker 侧的扩展工厂。
 *
 * 三种形态共用同一个工厂：
 * - **Plan worker**（`depth 0`）：服务一个已授权的 Plan，拿到受限的 `orchestrator_read` /
 *   `orchestrator_write`（无 `init`、无 `move`、`completed` 需放行）、`orchestrator_check`
 *   与 `orchestrator_report`，以及一个受限的子派工 `orchestrator_dispatch`。
 * - **临时 worker**（无 Plan、一次性）：只拿到只读 `orchestrator_read`（不带
 *   `lockedPlan`，可跨域只读）与 `orchestrator_report`，以及同一个受限子派工；
 *   **不注册**写工具与校验工具。
 * - **子 worker**（`depth >= 1`）：同样只有只读 `orchestrator_read` 与 `orchestrator_report`，
 *   但**不再**注册 `orchestrator_dispatch` —— 只能往下派一层。
 *
 * 它没有 `ask_questions`，也没有句柄表与崩溃凭据 —— 那些属于编排方，两套工厂
 * 必须彻底分开。
 * @module @kxh4892636/pi-toolkit/orchestrator/worker
 */

import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readPromptText, readWorkerPromptText } from "./assets.ts";
import type { ToolkitSettings } from "../settings.ts";
import type { PlanRef } from "./plan.ts";
import { planRefOf } from "./plan.ts";
import { createCheckTool } from "./tools/check.ts";
import { createReadTool } from "./tools/read.ts";
import { createSubDispatchTool } from "./subdispatch.ts";
import { createToolRuntime, textBlocks } from "./tools/shared.ts";
import { createWriteTool } from "./tools/write.ts";
import type { spawnWorker } from "./spawn.ts";
import { REPORT_OUTCOMES, type ReportOutcome, type WorkerReport } from "./types.ts";
import { DEFAULT_DOMAIN_ROOT } from "./config.ts";

/** worker 工厂的依赖。 */
export interface WorkerExtensionOptions {
  /** 本 worker 负责的 Plan；临时 worker 省略。 */
  readonly plan?: PlanRef;
  /** 临时 worker 的 id（与 `plan` 二选一）。 */
  readonly temp?: string;
  /** 子 worker（与 `plan` / `temp` 互斥）：上级标识与它在这一层里的序号。 */
  readonly sub?: { readonly parentRef: string; readonly index: number };
  /** 层级：0 = 编排方或子派工起的上一层，>=1 = 子 worker（不再有 `dispatch`）。缺省 0。 */
  readonly depth?: number;
  /** 上报入口；由桥接层接到编排方的会话。 */
  readonly report: (report: WorkerReport) => void;
  /** 当前设置；每次读取。 */
  readonly settings: () => ToolkitSettings;
  /** 已被编排方放行的 note id（收到 `pass` 后加入）。 */
  readonly released: Set<string>;
  /** 起 session 的接缝；只给子派工用，测试注入替身。 */
  readonly spawn?: typeof spawnWorker;
}

/** worker session 的活动工具名。 */
export const WORKER_TOOL_NAMES = [
  "orchestrator_read",
  "orchestrator_write",
  "orchestrator_check",
  "orchestrator_report",
  "orchestrator_dispatch",
] as const;

/** 临时 worker（无 Plan）的活动工具名：只读 + 上报 + 子派工，没有 notes 写与校验。 */
export const TEMP_WORKER_TOOL_NAMES = [
  "orchestrator_read",
  "orchestrator_report",
  "orchestrator_dispatch",
] as const;

/** 子 worker（`depth >= 1`）的活动工具名：只读 + 上报，不能再往下派。 */
export const SUB_WORKER_TOOL_NAMES = ["orchestrator_read", "orchestrator_report"] as const;

const isReportOutcome = (value: unknown): value is ReportOutcome =>
  typeof value === "string" && (REPORT_OUTCOMES as readonly string[]).includes(value);

/** 临时 worker 的提示词补充：没有 Plan，只读 + 上报。 */
const TEMP_SECTION = (routeKey: string): string =>
  [
    `## 本次是临时 worker（${routeKey}）`,
    "",
    "没有 Plan：只有只读的 `orchestrator_read` 与 `orchestrator_report`，没有写工具。",
    "结论写进 report 的 summary / evidence；需要建 Plan 时在 report 里建议，由编排方去问人。",
    "并行办事可以用 `orchestrator_dispatch` 派子 worker（一层，跑完即弃）。",
  ].join("\n");

/** 子 worker 的提示词补充：改得了文件、改不了 notes，不能再往下派。 */
const SUB_SECTION = (routeKey: string, depth: number): string =>
  [
    `## 本次是子 worker（${routeKey}，第 ${depth} 层）`,
    "",
    "你由上层 worker 派出，只做它给的那一件事；不得自己扩大范围。",
    "有宿主的文件工具（可以改工作区文件），orchestrator 一侧只有只读 `orchestrator_read` 与 `orchestrator_report`：",
    "**改不了 `notes.json`**（没有 `orchestrator_write`），也没有 `orchestrator_dispatch`（不能再往下派）。",
    "结论与证据写进 report；note 状态由上级 worker 改。需要人拍板时用 `needs_answer` 并写清问题。",
  ].join("\n");

/**
 * 构造 worker 的扩展工厂。
 *
 * 只注册工具与提示词；桥接状态（句柄表、崩溃凭据）全部留在编排方，避免同一进程
 * 内模块被多个 session 共享时互相干扰。
 * @param options - Plan 或临时 id、上报入口、设置读取与放行集合。
 * @returns 交给 `DefaultResourceLoader` 的 inline extension。
 */
export const createWorkerExtension = (options: WorkerExtensionOptions): ExtensionFactory => {
  const planDirectory = options.plan?.directory;
  const temp = options.temp;
  const sub = options.sub;
  const depth = options.depth ?? 0;
  const given = [planDirectory, temp, sub].filter((value) => value !== undefined);
  if (given.length !== 1) {
    throw new Error("worker 需要 plan / temp / sub 之一，且只能给一个");
  }
  /** 上报与子 worker 键的前缀：Plan 用目录绕对路径，临时 worker 用 `temp:<id>`。 */
  const routeKey =
    planDirectory ??
    (temp !== undefined ? `temp:${temp}` : `${sub?.parentRef ?? "?"}/sub:${sub?.index ?? 0}`);
  /** 展示名：子 worker 的 session 名与详情都用它。 */
  const parentRef =
    options.plan === undefined
      ? temp !== undefined
        ? `temp:${temp}`
        : routeKey
      : planRefOf(options.plan);
  const runtime = createToolRuntime({
    limits: () => options.settings().orchestrator,
    domainRoot: DEFAULT_DOMAIN_ROOT,
    role: "worker",
    ...(planDirectory === undefined ? {} : { lockedPlan: planDirectory }),
    released: (noteId) => options.released.has(noteId),
  });

  return (pi: ExtensionAPI): void => {
    // 本 session 就是 worker：工具随注册即激活，不需要模式开关。
    // 临时 worker 与子 worker 没有 Plan，就不给写工具与校验工具（写不进去，也无 Plan 可校验）。
    // 子 worker（depth >= 1）不再拿 `dispatch`：只往下派一层。
    const tools = [
      createReadTool(runtime),
      ...(planDirectory === undefined ? [] : [createWriteTool(runtime), createCheckTool(runtime)]),
      ...(depth === 0
        ? [
            createSubDispatchTool({
              pi,
              parentRoute: routeKey,
              parentRef,
              depth,
              settings: options.settings,
              ...(options.spawn === undefined ? {} : { spawn: options.spawn }),
            }),
          ]
        : []),
      createReportTool(options, routeKey),
    ];
    for (const tool of tools) {
      pi.registerTool({ ...tool, defaultActive: true });
    }
    pi.on("before_agent_start", (event) => {
      const sections = event.systemPromptOptions.sections;
      const parts = [readPromptText(), "", readWorkerPromptText()];
      if (planDirectory === undefined) {
        parts.push("", temp !== undefined ? TEMP_SECTION(routeKey) : SUB_SECTION(routeKey, depth));
      }
      sections["orchestrator"] = parts.join("\n");
    });
  };
};

/** `orchestrator_report`：worker 唯一的上报出口。 */
const createReportTool = (options: WorkerExtensionOptions, routeKey: string) => ({
  name: "orchestrator_report",
  label: "Report",
  description:
    "把一条 note 的进展、待答问题或待验收结果上报给编排方。完成用 needs_review，需要人回答用 needs_answer，受阻或失败用 blocked / failed；done 只用于进展播报。",
  promptSnippet: "Report a note's progress, question, or ready-for-review result.",
  promptGuidelines: [
    "worker 有笔没印：把 note 置 waiting(needs=review) 后用 needs_review 上报，等编排方下发 pass 再 complete。",
    "需要人决定时用 needs_answer 并给出 question，不要自己扩大范围。",
  ],
  parameters: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: false,
    properties: {
      outcome: {
        type: "string",
        enum: [...REPORT_OUTCOMES],
        description: "上报结论",
      },
      note: { type: "string", description: "note id" },
      summary: { type: "string", description: "一句话摘要，直接给人看" },
      question: { type: "string", description: "outcome=needs_answer 时必填" },
      evidence: {
        type: "array",
        items: { type: "string" },
        description: "已产出的证据（命令与输出、文件、commit）",
      },
    },
    required: ["outcome", "note", "summary"],
  }),
  async execute(_toolCallId: string, raw: unknown) {
    const args = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const outcome = args["outcome"];
    if (!isReportOutcome(outcome)) {
      throw new Error(`outcome 必须是 ${REPORT_OUTCOMES.join(" | ")}`);
    }
    const note = args["note"];
    const summary = args["summary"];
    if (typeof note !== "string" || note.trim() === "") throw new Error("note 必填");
    if (typeof summary !== "string" || summary.trim() === "") throw new Error("summary 必填");
    const question = args["question"];
    if (outcome === "needs_answer" && (typeof question !== "string" || question.trim() === "")) {
      throw new Error("outcome=needs_answer 必须给 question");
    }
    const evidence = args["evidence"];
    const report: WorkerReport = {
      outcome,
      note,
      summary,
      ...(typeof question === "string" ? { question } : {}),
      ...(Array.isArray(evidence)
        ? { evidence: evidence.filter((item): item is string => typeof item === "string") }
        : {}),
      plan: routeKey,
      at: new Date().toISOString(),
    };
    options.report(report);
    return {
      content: textBlocks(`已上报 ${outcome}（note ${note}）。收到编排方的输入后继续。`),
      details: { ...report },
    };
  },
});
