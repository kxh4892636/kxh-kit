/**
 * worker 侧的扩展工厂。
 *
 * 一个 worker session 只服务于一个已授权的 Plan：它拿到的是受限的
 * `orchestrator_read` / `orchestrator_write`（无 `init`、无 `move`、`completed`
 * 需放行）、外加 `orchestrator_report`。它没有 `ask_questions`，也没有句柄表与
 * 崩溃凭据 —— 那些属于编排方，两套工厂必须彻底分开。
 * @module @kxh4892636/pi-toolkit/orchestrator/worker
 */

import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readPromptText, readWorkerPromptText } from "./assets.ts";
import type { ToolkitSettings } from "../settings.ts";
import type { PlanRef } from "./plan.ts";
import { createCheckTool } from "./tools/check.ts";
import { createReadTool } from "./tools/read.ts";
import { createToolRuntime, textBlocks } from "./tools/shared.ts";
import { createWriteTool } from "./tools/write.ts";
import { REPORT_OUTCOMES, type ReportOutcome, type WorkerReport } from "./types.ts";
import { DEFAULT_DOMAIN_ROOT } from "./config.ts";

/** worker 工厂的依赖。 */
export interface WorkerExtensionOptions {
  /** 本 worker 负责的 Plan。 */
  readonly plan: PlanRef;
  /** 上报入口；由桥接层接到编排方的会话。 */
  readonly report: (report: WorkerReport) => void;
  /** 当前设置；每次读取。 */
  readonly settings: () => ToolkitSettings;
  /** 已被编排方放行的 note id（收到 `pass` 后加入）。 */
  readonly released: Set<string>;
}

/** worker session 的活动工具名。 */
export const WORKER_TOOL_NAMES = [
  "orchestrator_read",
  "orchestrator_write",
  "orchestrator_check",
  "orchestrator_report",
] as const;

const isReportOutcome = (value: unknown): value is ReportOutcome =>
  typeof value === "string" && (REPORT_OUTCOMES as readonly string[]).includes(value);

/**
 * 构造 worker 的扩展工厂。
 *
 * 只注册工具与提示词；桥接状态（句柄表、崩溃凭据）全部留在编排方，避免同一进程
 * 内模块被多个 session 共享时互相干扰。
 * @param options - Plan、上报入口、设置读取与放行集合。
 * @returns 交给 `DefaultResourceLoader` 的 inline extension。
 */
export const createWorkerExtension = (options: WorkerExtensionOptions): ExtensionFactory => {
  const runtime = createToolRuntime({
    limits: () => options.settings().orchestrator,
    domainRoot: DEFAULT_DOMAIN_ROOT,
    role: "worker",
    lockedPlan: options.plan.directory,
    released: (noteId) => options.released.has(noteId),
  });

  return (pi: ExtensionAPI): void => {
    // 本 session 就是 worker：四个工具随注册即激活，不需要模式开关。
    for (const tool of [
      createReadTool(runtime),
      createWriteTool(runtime),
      createCheckTool(runtime),
      createReportTool(options),
    ]) {
      pi.registerTool({ ...tool, defaultActive: true });
    }
    pi.on("before_agent_start", (event) => {
      const sections = event.systemPromptOptions.sections;
      sections["orchestrator"] = [readPromptText(), "", readWorkerPromptText()].join("\n");
    });
  };
};

/** `orchestrator_report`：worker 唯一的上报出口。 */
const createReportTool = (options: WorkerExtensionOptions) => ({
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
      plan: options.plan.directory,
      at: new Date().toISOString(),
    };
    options.report(report);
    return {
      content: textBlocks(`已上报 ${outcome}（note ${note}）。收到编排方的输入后继续。`),
      details: { ...report },
    };
  },
});
