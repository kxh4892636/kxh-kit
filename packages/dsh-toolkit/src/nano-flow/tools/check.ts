import { assetsCheckScript } from "../assets.js";
import { formatIssues, runCheck } from "../check-runner.js";
import { planRefOf, resolvePlan } from "../plan.js";
import {
  asArguments,
  optionalString,
  requiredString,
  textBlocks,
  type ToolRuntime,
} from "./shared.js";
import type { ToolDefinitionLike } from "../services.js";

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
  exec: { signal: AbortSignal; agent?: unknown },
): Promise<string> => {
  const op = requiredString(args, "op");
  if (op === "limits") return formatLimits(runtime);
  if (!(CHECK_OPS as readonly string[]).includes(op)) {
    throw new Error(`未知的 op: ${op}（可用: ${CHECK_OPS.join(" | ")}）`);
  }
  const workspace = await runtime.workspace(exec);
  const plan =
    op === "plan"
      ? await resolvePlan(workspace, runtime.domainRoot, optionalString(args, "plan"))
      : undefined;
  const result = await runCheck({
    script: assetsCheckScript(runtime.assetsRoot),
    workspace,
    domainsPath: runtime.domainRoot,
    limits: runtime.limits(),
    ...(plan === undefined ? {} : { planRef: planRefOf(plan) }),
  });
  if (result.ok) {
    return plan === undefined
      ? `工作区校验通过（${workspace}）。`
      : `Plan 校验通过: ${planRefOf(plan)}`;
  }
  return [`校验失败，共 ${result.errors.length} 项：`, formatIssues(result.errors)].join("\n");
};

/**
 * 构造 `nano_flow_check`：单个 Plan、整个工作区或上限回显。
 * @param runtime - 共享运行期依赖。
 * @returns 工具定义。
 */
export const createCheckTool = (runtime: ToolRuntime): ToolDefinitionLike => ({
  name: "nano_flow_check",
  description:
    "校验 Nano Flow 的结构：plan 校验单个 Plan（布局、story/spec 字节、notes DAG、索引）；workspace 额外校验领域文档与全部 active 的 Plan；limits 回显当前生效的上限数字。",
  parameters: {
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
  },
  output: { schema: { type: "string" }, render: (_args, value) => textBlocks(value) },
  async execute(raw, exec) {
    return executeCheck(runtime, asArguments(raw), exec);
  },
});
