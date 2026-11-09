/**
 * `nano_flow_check`：校验领域文档并自动生成/更新索引。
 * 规则只有 `check-domain.mjs` 一处实现；本工具只负责取参数、调用与渲染结果。
 * @module @kxh4892636/pi-toolkit/nano-flow/tools/check
 */

import { Type } from "typebox";

import { limitsOf } from "../config.ts";
import { formatIssues, runCheck } from "../check-runner.ts";
import type { NanoDeps } from "./shared.ts";
import { asArguments, optionalBoolean, optionalString } from "./shared.ts";

/** 构造 `nano_flow_check` 工具定义。 */
export const createCheckTool = (deps: NanoDeps) => ({
  name: "nano_flow_check",
  label: "Nano Flow Check",
  description:
    "校验 Nano Flow 的领域文档（YAML 头、三位数字 name、篇幅、status/reason/related_noted、Plan 状态派生），并自动创建/更新 CONTEXT-MAP.md、questions/adr/workflows 的 index.md、notes_index.md 与 spec 的 ## 追踪 Note。domain 过滤只校验该域且不重写 CONTEXT-MAP；plan 过滤只校验该 Plan。本工具不写 Plan 绑定。",
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
    if (result.updated.length > 0) {
      lines.push(`已更新索引 ${result.updated.length} 个：`);
      lines.push(result.updated.map((file) => `- ${file}`).join("\n"));
    }
    const text = lines.join("\n");
    return { content: [{ type: "text" as const, text }], details: { text } };
  },
});
