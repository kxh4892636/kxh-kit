import { Type } from "typebox";
import type { ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { formatIssues, runCheck } from "../check-runner.js";
import { openDocument } from "../store.js";
import { listPlans, planRefOf, resolvePlan } from "../plan.js";
import {
  asArguments,
  optionalString,
  requiredString,
  textBlocks,
  checkScriptPath,
  type ToolRuntime,
} from "./shared.js";

const CHECK_OPS = ["plan", "workspace", "limits"] as const;

const KB = 1024;

const formatLimits = (runtime: ToolRuntime): string => {
  const limits = runtime.limits();
  const kb = (value: number): string => `${Math.round((value / KB) * 100) / 100} KB`;
  return [
    "生效上限（来自 toolkit 面板的 Nano Flow 设置）：",
    `  story.md: ${kb(limits.storyMaxBytes)}`,
    `  spec.md: ${kb(limits.specMaxBytes)}`,
    `  单条 note: ${kb(limits.noteMaxBytes)}`,
    `  note 摘要: ${limits.noteDescriptionMaxChars} 字`,
    `  关键索引: ${limits.indexMaxRows} 行`,
    `  CONTEXT.md: ${kb(limits.contextMaxBytes)}`,
    `  QUESTIONS.md: ${kb(limits.questionsMaxBytes)}`,
    `  单个 ADR: ${kb(limits.adrMaxBytes)}`,
    `  ADR 数量: ${limits.adrMaxCount} 个`,
    `  轮转阈值: ${limits.rotateAt}`,
  ].join("\n");
};

const executeCheck = async (
  runtime: ToolRuntime,
  args: Record<string, unknown>,
  exec: ExtensionToolContext,
): Promise<string> => {
  const op = requiredString(args, "op");
  if (op === "limits") return formatLimits(runtime);
  if (!(CHECK_OPS as readonly string[]).includes(op)) {
    throw new Error(`未知的 op: ${op}（可用: ${CHECK_OPS.join(" | ")}）`);
  }
  const workspace = runtime.workspace(exec);
  const plan =
    op === "plan"
      ? await resolvePlan(workspace, runtime.domainRoot, optionalString(args, "plan"))
      : undefined;
  const repairs: string[] = [];
  if (plan !== undefined) {
    repairs.push(...(await openDocument(plan.directory, runtime.limits())).repairs);
  } else {
    for (const candidate of await listPlans(workspace, runtime.domainRoot)) {
      try {
        repairs.push(...(await openDocument(candidate.directory, runtime.limits())).repairs);
      } catch {
        // 不可修复的问题留给校验脚本报告。
      }
    }
  }
  const prefix =
    repairs.length === 0
      ? ""
      : `已自动修复：\n${repairs.map((item) => `- ${item}`).join("\n")}\n\n`;
  const result = await runCheck({
    script: checkScriptPath(),
    workspace,
    domainsPath: runtime.domainRoot,
    limits: runtime.limits(),
    ...(plan === undefined ? {} : { planRef: planRefOf(plan) }),
  });
  if (result.ok) {
    return `${prefix}${
      plan === undefined ? `工作区校验通过（${workspace}）。` : `Plan 校验通过: ${planRefOf(plan)}`
    }`;
  }
  return `${prefix}${[
    `校验失败，共 ${result.errors.length} 项：`,
    formatIssues(result.errors),
  ].join("\n")}`;
};

/**
 * 构造 `nano_flow_check`：单个 Plan、整个工作区或上限回显。
 * @param runtime - 共享运行期依赖。
 * @returns 工具定义。
 */
export const createCheckTool = (runtime: ToolRuntime): ToolDefinition => ({
  name: "nano_flow_check",
  label: "Nano Flow Check",
  description:
    "校验 Nano Flow 的结构：plan 校验单个 Plan（布局、story/spec 字节、notes DAG、索引）；workspace 额外校验领域文档与全部 active 的 Plan；limits 回显当前生效的上限数字。",
  promptSnippet: "Validate Nano Flow plans, workspace domain docs and limits.",
  parameters: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: false,
    properties: {
      op: {
        type: "string",
        enum: [...CHECK_OPS],
        description: "plan | workspace | limits",
      },
      plan: {
        type: "string",
        description: "<domain>/<lifecycle>/<name>；工作区只有一个 active 的 Plan 时可省略",
      },
    },
    required: ["op"],
  }),
  async execute(_toolCallId, raw, _signal, _onUpdate, exec) {
    return {
      content: textBlocks(await executeCheck(runtime, asArguments(raw), exec)),
      details: {},
    };
  },
});
