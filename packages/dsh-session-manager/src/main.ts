/**
 * dsh-session-manager 插件入口: 注册 9 个会话/模型管理工具与精简指引章节。
 *
 * 工具面契约见 ADR-0002(仅模型工具交付); 约束为进程内直调 Host 服务,
 * 因此本插件的能力面(sessionController 等)经嵌套作用域注入。
 * 会话上下文注入(ADR-0004)经 ctx.agents 接线到 spawn 的 context 参数。
 */
import type { Context } from "@deepseek-ai/cordis";
import { SessionManagerHost } from "./host.ts";
import type { HostServices } from "./host.ts";
import { makeContextInstaller } from "./session-context.ts";
import type { AgentStoreLike } from "./session-context.ts";
import { buildSessionTools } from "./tools.ts";

export const name = "session-manager";

/**
 * 入口 inject: 只声明每套 DSH 组合(dsh-base 核心)都提供的服务, 兼作登记顺序保证。
 *
 * 能力服务不能写在这里——cordis 4 的 inject 没有可选语义: `Fiber._refresh` 要求每个
 * 名字都已在 store 中, 缺一即让条目停在 pending; app-boot 的 `assertEntriesActivated`
 * 又把 pending 当作致命错误(退出码 7), 于是整棵插件树都起不来。
 */
export const inject = ["tools", "systemPrompt"];

/**
 * 能力依赖: `sessionController` 由 web-app 层的 `@deepseek-ai/dsh-api-session-controller`
 * 行拥有, `workspaceRegistry`/`agents` 是它的伴生面。没有该服务的组合(如 dsh-tui:
 * dsh-base + dsh-tui, 无 web-app 层)没有任何本插件可服务的对象, 故放进嵌套作用域
 * 按需挂载: 入口照常激活, 服务齐备后工具与指引才登记。cordis 上游同款写法见
 * `dsh-agent` 的 typert 登记与 `dsh-api-session-controller` 的 jobs 订阅。
 */
export const capabilityInject = ["sessionController", "workspaceRegistry", "agents"];

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

/** 本插件用到的 ctx 服务槽: 必需服务 + `ctx.get` 读取面(cordis Context 未声明这些名字)。 */
type HostServiceSlots = Pick<HostServices, "sessionController" | "workspaceRegistry"> & {
  get(name: string): unknown;
};

/**
 * 组装 Host 服务槽。能力服务已在嵌套作用域的 `capabilityInject` 中声明,
 * 域内直接读取即可; 其余服务未经 inject, 只能经 `ctx.get` 读取——cordis 对
 * 直读未声明的 ctx 服务会抛 `cannot get property "…" without inject`,
 * 缺席时由 host.ts 的可选字段分支降级。
 */
const hostServicesOf = (ctx: Context): HostServices => {
  const slots = ctx as unknown as HostServiceSlots;
  const sessions = slots.get("sessions") as HostServices["sessions"];
  const sessionProjections = slots.get("sessionProjections") as HostServices["sessionProjections"];
  const sessionQuery = slots.get("sessionQuery") as HostServices["sessionQuery"];
  return {
    sessionController: slots.sessionController,
    workspaceRegistry: slots.workspaceRegistry,
    ...(sessions === undefined ? {} : { sessions }),
    ...(sessionProjections === undefined ? {} : { sessionProjections }),
    ...(sessionQuery === undefined ? {} : { sessionQuery }),
  };
};

export function apply(ctx: Context): void {
  ctx.inject(capabilityInject, (scope: Context) => {
    const agents = (scope as unknown as { readonly agents?: AgentStoreLike }).agents;
    const host = new SessionManagerHost(hostServicesOf(scope), {
      contextInstaller: makeContextInstaller(agents === undefined ? {} : { agents }),
    });
    scope.systemPrompt.section({
      name: "tool:session-manager",
      order: GUIDANCE_ORDER,
      text: GUIDANCE,
    });
    for (const tool of buildSessionTools(host)) {
      scope.tools.register(tool);
    }
  });
}
