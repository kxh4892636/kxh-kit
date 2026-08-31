/**
 * dsh-session-manager 插件入口: 注册 9 个会话/模型管理工具与精简指引章节。
 *
 * 工具面契约见 ADR-0002(仅模型工具交付); 约束为进程内直调 Host 服务,
 * 因此本插件的 apply(ctx) 从 app 上下文注入 sessionController 等。
 * 会话上下文注入(ADR-0004)经 ctx.agents 接线到 spawn 的 context 参数。
 */
import type { Context } from "@deepseek-ai/cordis";
import { SessionManagerHost } from "./host.ts";
import type { HostServices } from "./host.ts";
import { makeContextInstaller } from "./session-context.ts";
import type { AgentStoreLike } from "./session-context.ts";
import { buildSessionTools } from "./tools.ts";

export const name = "session-manager";
export const inject = ["tools", "sessionController", "workspaceRegistry", "systemPrompt"];

/** 指引章节排位: TOOL_RALPH(2700) 与 TOOL_SUBAGENT(2800) 之间。 */
const GUIDANCE_ORDER = 2750;

const GUIDANCE = [
  "会话与模型管理工具: 用 session_list 找到目标会话, session_read 分页读取其消息历史;",
  "派生并行会话用 session_spawn(创建 + 可选选模型 + 可选 context 作为其系统消息上下文, 不触发模型调用),",
  " 预置指令即其默认携带的系统消息;",
  "向会话投递指令/反馈用 session_prompt(mode 默认 queue, 运行中的会话可 steer);",
  "等待会话收敛用 session_wait; 模型目录用 session_model_list, 会话选型用 session_model_select;",
  "清理用 session_archive(隐藏, 无硬删除); 目录可读性用 session_rename。",
].join("\n");

export function apply(ctx: Context): void {
  const agents = (ctx as unknown as { readonly agents?: AgentStoreLike }).agents;
  const host = new SessionManagerHost(ctx as unknown as HostServices, {
    contextInstaller: makeContextInstaller(agents === undefined ? {} : { agents }),
  });
  ctx.systemPrompt.section({
    name: "tool:session-manager",
    order: GUIDANCE_ORDER,
    text: GUIDANCE,
  });
  for (const tool of buildSessionTools(host)) {
    ctx.tools.register(tool);
  }
}
