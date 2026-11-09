/**
 * `nano_flow_bind`：把当前会话绑定到指定 Plan，是唯一的绑定入口。
 * 同一会话最后一条绑定生效；再次调用即切换。绑定只影响侧栏与恢复 seed，不改 Plan 内容。
 * @module @kxh4892636/pi-toolkit/nano-flow/tools/bind
 */

import { Type } from "typebox";

import { DEFAULT_DOMAIN_ROOT } from "../config.ts";
import { PLAN_LIFECYCLES, planRefOf, resolvePlan } from "../plan.ts";
import type { NanoDeps } from "./shared.ts";
import { asArguments, optionalString, requiredString } from "./shared.ts";

/** 构造 `nano_flow_bind` 工具定义。 */
export const createBindTool = (deps: NanoDeps) => ({
  name: "nano_flow_bind",
  label: "Nano Flow Bind",
  description:
    "把本会话绑定到指定 Plan（同一会话只保留一个绑定，再次调用即切换）。绑定决定 Note 侧栏与恢复 seed 指向哪个 Plan；不修改 Plan 内容与 note 状态。",
  promptSnippet: "Bind this session to a Nano Flow plan.",
  parameters: Type.Object({
    plan: Type.String({ description: "Plan 目录名，例如 2026-11-09-示例" }),
    domain: Type.Optional(Type.String({ description: "限定业务域；同名 Plan 跨域时必填" })),
    lifecycle: Type.Optional(
      Type.String({
        enum: [...PLAN_LIFECYCLES],
        description: "限定生命周期；省略时跨 active/reference/archived 查找",
      }),
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
    const plan = await resolvePlan(ctx.cwd, DEFAULT_DOMAIN_ROOT, {
      plan: requiredString(args, "plan"),
      ...(optionalString(args, "domain") === undefined
        ? {}
        : { domain: optionalString(args, "domain") as string }),
      ...(optionalString(args, "lifecycle") === undefined
        ? {}
        : { lifecycle: optionalString(args, "lifecycle") as string }),
    });
    deps.bind(plan.directory, ctx.cwd);
    const text = [
      `已绑定 Plan: ${planRefOf(plan)}`,
      "同一会话只保留一个绑定；再次调用本工具即切换。",
      "Note 侧栏会在本轮结束时跟随新 Plan。",
    ].join("\n");
    return { content: [{ type: "text" as const, text }], details: { text } };
  },
});
