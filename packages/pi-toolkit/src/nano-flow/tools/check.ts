/**
 * `nano_flow_check`：校验领域文档并自动生成/更新索引。
 * 规则只有 `check-domain.mjs` 一处实现；本工具只负责取参数、调用与渲染结果。
 * @module @kxh4892636/pi-toolkit/nano-flow/tools/check
 */

import { Type } from "typebox";

import { limitsOf } from "../config.ts";
import { formatIssues, runCheck, type CheckResult } from "../check-runner.ts";
import type { NanoDeps } from "./shared.ts";
import { asArguments, optionalBoolean, optionalString } from "./shared.ts";

/** 校验结果必须带的四个数组名。 */
const RESULT_LISTS = ["errors", "warnings", "updated", "fixed"] as const;

/** 形状守卫：缺字段说明工具与 `scripts/check-domain.mjs` 不是同一版本（旧会话挂着旧模块）。 */
const assertResultShape = (result: CheckResult): CheckResult => {
  const missing = RESULT_LISTS.filter(
    (key) => !Array.isArray((result as unknown as Record<string, unknown>)[key]),
  );
  if (missing.length === 0) return result;
  throw new Error(
    `校验结果缺少 ${missing.join("、")}：扩展代码已更新，但当前进程仍持有旧模块；重启 pi 或 /reload 后重试`,
  );
};

/** 把校验结果渲染成给模型看的文本。 */
export const renderCheckReport = (raw: CheckResult): string => {
  const result = assertResultShape(raw);
  const lines: string[] = [];
  if (result.ok) lines.push("领域文档校验通过。");
  else {
    lines.push(`领域文档校验失败，共 ${result.errors.length} 项：`);
    lines.push(formatIssues(result.errors));
  }
  if (result.warnings.length > 0) {
    lines.push(`警告 ${result.warnings.length} 项：`);
    lines.push(formatIssues(result.warnings));
  }
  if (result.fixed.length > 0) {
    lines.push(`已自动修复 ${result.fixed.length} 项：`);
    lines.push(formatIssues(result.fixed));
  }
  if (result.updated.length > 0) {
    lines.push(`已更新索引 ${result.updated.length} 个：`);
    lines.push(result.updated.map((file) => `- ${file}`).join("\n"));
  }
  return lines.join("\n");
};

/** 构造 `nano_flow_check` 工具定义。 */
export const createCheckTool = (deps: NanoDeps) => ({
  name: "nano_flow_check",
  label: "Nano Flow Check",
  description:
    "校验 Nano Flow 的领域文档（YAML 头、三位数字 name、篇幅、status/reason/related_noted、Plan 状态派生），并自动修复可确定的问题（spec 状态派生、name 对齐文件名、非 blocked 的 reason、多行头字段折成单行、缺 questions 目录），同时创建/更新 CONTEXT-MAP.md、questions/adr/workflows 的 index.md、notes_index.md 与 spec 的 ## 追踪 Note。domain 过滤只校验该域且不重写 CONTEXT-MAP；plan 过滤只校验该 Plan。本工具不写 Plan 绑定。",
  promptSnippet: "Validate Nano Flow docs and regenerate all indexes.",
  parameters: Type.Object({
    domain: Type.Optional(Type.String({ description: "只校验指定域，省略表示全工作区" })),
    plan: Type.Optional(Type.String({ description: "只校验指定 Plan 目录名" })),
    strict: Type.Optional(
      Type.Boolean({ description: "缺省 true；false 时把旧格式文档记为警告并跳过" }),
    ),
  }),
  async execute(
    _toolCallId: string,
    raw: unknown,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    ctx: { readonly cwd: string },
  ) {
    const args = asArguments(raw);
    const result = runCheck(ctx.cwd, limitsOf(deps.settings()), {
      ...(optionalString(args, "domain") === undefined
        ? {}
        : { domain: optionalString(args, "domain") as string }),
      ...(optionalString(args, "plan") === undefined
        ? {}
        : { plan: optionalString(args, "plan") as string }),
      ...(optionalBoolean(args, "strict") === undefined
        ? {}
        : { strict: optionalBoolean(args, "strict") as boolean }),
    });
    const text = renderCheckReport(result);
    return { content: [{ type: "text" as const, text }], details: { text } };
  },
});
