import { isPlanLifecycle, listPlans, PLAN_LIFECYCLES, planRefOf, type PlanRef } from "../plan.js";
import type { ToolDefinitionLike } from "../services.js";
import {
  asArguments,
  optionalString,
  requiredString,
  textBlocks,
  type ToolRuntime,
} from "./shared.js";

/** 按目录名解析 Plan；可通过 domain / lifecycle 消歧。 */
const resolvePlan = async (
  runtime: ToolRuntime,
  workspace: string,
  args: Record<string, unknown>,
): Promise<PlanRef> => {
  const name = requiredString(args, "plan");
  const domain = optionalString(args, "domain");
  const lifecycle = optionalString(args, "lifecycle");
  if (lifecycle !== undefined && !isPlanLifecycle(lifecycle)) {
    throw new Error(`lifecycle 必须是 ${PLAN_LIFECYCLES.join(" | ")}`);
  }
  const matches = (await listPlans(workspace, runtime.domainRoot)).filter(
    (plan) =>
      plan.name === name &&
      (domain === undefined || plan.domain === domain) &&
      (lifecycle === undefined || plan.lifecycle === lifecycle),
  );
  if (matches.length === 0) {
    throw new Error(
      `找不到 Plan: ${name}${domain === undefined ? "" : `（domain=${domain}）`}${lifecycle === undefined ? "" : `（lifecycle=${lifecycle}）`}`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `找到多个同名 Plan，请补 domain 或 lifecycle：${matches.map(planRefOf).join("、")}`,
    );
  }
  return matches[0] as PlanRef;
};

const executeBind = async (
  runtime: ToolRuntime,
  args: Record<string, unknown>,
  exec: { signal: AbortSignal; agent?: unknown },
): Promise<string> => {
  if (runtime.rebind === undefined) throw new Error("当前宿主未提供 Plan 绑定能力");
  const workspace = await runtime.workspace(exec);
  const plan = await resolvePlan(runtime, workspace, args);
  await runtime.rebind(exec, plan.directory, workspace);
  return [
    `已绑定 Plan: ${planRefOf(plan)}`,
    "同一会话只保留一个绑定；再次调用本工具即切换。",
    "Note 看板立即跟随；本轮结束后的轨迹与后续轮次写入新 Plan 的 log.jsonl。",
  ].join("\n");
};

/**
 * 构造 `nano_flow_bind`：把当前会话绑定到指定 Plan，再次调用即切换。
 * @param runtime - 共享运行期依赖。
 * @returns 工具定义。
 */
export const createBindTool = (runtime: ToolRuntime): ToolDefinitionLike => ({
  name: "nano_flow_bind",
  description:
    "把本会话绑定到指定 Plan（同一会话只保留一个绑定，再次调用即切换）。绑定决定 Note 看板与 log.jsonl 的目标；不修改 Plan 内容与 note 状态。",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      plan: { type: "string", description: "Plan 目录名，例如 2026-11-09-示例" },
      domain: { type: "string", description: "限定业务域；同名 Plan 跨域时必填" },
      lifecycle: {
        type: "string",
        enum: [...PLAN_LIFECYCLES],
        description: "限定生命周期；省略时跨 active/reference/archived 查找",
      },
    },
    required: ["plan"],
  },
  output: { schema: { type: "string" }, render: (_args, value) => textBlocks(value) },
  async execute(raw, exec) {
    return executeBind(runtime, asArguments(raw), exec);
  },
});
