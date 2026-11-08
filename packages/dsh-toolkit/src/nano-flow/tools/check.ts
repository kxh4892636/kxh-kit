import { assetsCheckScript } from "../assets.js";
import { formatIssues, runCheck } from "../check-runner.js";
import { listActivePlans } from "../notes.js";
import { listPlans } from "../plan.js";
import {
  asArguments,
  optionalBoolean,
  optionalString,
  textBlocks,
  type ToolRuntime,
} from "./shared.js";
import type { ToolDefinitionLike } from "../services.js";

const executeCheck = async (
  runtime: ToolRuntime,
  args: Record<string, unknown>,
  exec: { signal: AbortSignal; agent?: unknown },
): Promise<string> => {
  const workspace = await runtime.workspace(exec);
  const domain = optionalString(args, "domain");
  const plan = optionalString(args, "plan");
  const strict = optionalBoolean(args, "strict");
  const result = await runCheck({
    script: assetsCheckScript(runtime.assetsRoot),
    workspace,
    domainsPath: runtime.domainRoot,
    limits: runtime.limits(),
    ...(domain === undefined ? {} : { domain }),
    ...(plan === undefined ? {} : { plan }),
    ...(strict === undefined ? {} : { strict }),
  });
  // 不带 plan：沿用「唯一 active Plan」的启发式；带 plan：跨生命周期按目录名定位，
  // 这样多 active Plan 的工作区恢复 reference/archived 也能建立看板绑定。
  const plans = listActivePlans(runtime.domainsDirectory(workspace));
  const target =
    plan === undefined
      ? plans.length === 1
        ? plans[0]
        : undefined
      : (await listPlans(workspace, runtime.domainRoot)).find((item) => item.name === plan)
          ?.directory;
  if (target !== undefined) await runtime.bind?.(exec, target, workspace);
  const lines: string[] = [];
  if (result.ok) {
    lines.push("领域文档校验通过。");
  } else {
    lines.push(`领域文档校验失败，共 ${result.errors.length} 项：`);
    lines.push(formatIssues(result.errors));
  }
  if (result.warnings.length > 0) {
    lines.push(`警告 ${result.warnings.length} 项：`);
    lines.push(formatIssues(result.warnings));
  }
  if (result.updated.length > 0) {
    lines.push(`已更新索引 ${result.updated.length} 个：`);
    lines.push(result.updated.map((file) => `- ${file}`).join("\n"));
  }
  return lines.join("\n");
};

/**
 * 构造 `nano_flow_check`：校验领域文档并自动生成/更新全部索引。
 * @param runtime - 共享运行期依赖。
 * @returns 工具定义。
 */
export const createCheckTool = (runtime: ToolRuntime): ToolDefinitionLike => ({
  name: "nano_flow_check",
  description:
    "校验 Nano Flow 的领域文档（YAML 头、三位数字 name、篇幅、status/reason/related_noted、Plan 状态派生），并自动创建/更新 CONTEXT-MAP.md、questions/adr/workflows 的 index.md、notes_index.md 与 spec 的 ## 追踪 Note。domain 过滤只校验该域且不重写 CONTEXT-MAP；plan 过滤只校验该 Plan，并把本会话绑定到它（含 reference/archived）。",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      domain: { type: "string", description: "只校验指定域，省略表示全工作区" },
      plan: { type: "string", description: "只校验指定 Plan 目录名" },
      strict: {
        type: "boolean",
        description: "缺省 true；false 时把旧格式文档记为警告并跳过",
      },
    },
    required: [],
  },
  output: { schema: { type: "string" }, render: (_args, value) => textBlocks(value) },
  async execute(raw, exec) {
    return executeCheck(runtime, asArguments(raw), exec);
  },
});
