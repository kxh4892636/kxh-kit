/**
 * dsh-session-manager 插件入口: 注册 9 个会话/模型管理工具。
 *
 * 工具面契约见 ADR-0002(仅模型工具交付); 约束为进程内直调 Host 服务,
 * 因此本插件的全部能力服务都在入口 inject 中声明。
 * 会话上下文注入(ADR-0004)经 ctx.agents 接线到 spawn 的 context 参数。
 * 不额外写系统提示词章节: 9 个工具的名称与描述已随工具目录下发, 复述只会重复占用 prompt。
 */
import type { Context } from "@deepseek-ai/cordis";
import { SessionManagerHost } from "./host/host.ts";
import type { HostServices } from "./host/host-contract.ts";
import { makeContextInstaller } from "./session-context.ts";
import type { AgentStoreLike } from "./session-context.ts";
import { buildSessionTools } from "./tools.ts";

export const name = "session-manager";

/**
 * 入口 inject: 本插件只装进 `web` profile, `sessionController` 由该组合 web-app 层的
 * `@deepseek-ai/dsh-api-session-controller` 行拥有, `workspaceRegistry`/`agents` 是它的
 * 伴生面, 与 `tools` 一样按组合齐备声明。
 *
 * 代价是 cordis 4 的 inject 没有可选语义: `Fiber._refresh` 要求每个名字都已在 store 中,
 * 缺一即让条目停在 pending, 而 app-boot 的 `assertEntriesActivated` 把 pending 当作致命
 * 错误(`1 entry did not activate`, 退出码 7)。因此不含 web-app 层的组合(如 dsh-tui =
 * dsh-base + dsh-tui)装不上本插件。
 */
export const inject = ["tools", "sessionController", "workspaceRegistry", "agents"];

/** 本插件用到的 ctx 服务槽: 必需服务 + `ctx.get` 读取面(cordis Context 未声明这些名字)。 */
type HostServiceSlots = Pick<HostServices, "sessionController" | "workspaceRegistry"> & {
  get(name: string): unknown;
};

/**
 * 组装 Host 服务槽。能力服务已在 `inject` 中声明, 直接读取即可;
 * 其余服务未经 inject, 只能经 `ctx.get` 读取——cordis 对直读未声明的 ctx 服务
 * 会抛 `cannot get property "…" without inject`, 缺席时由 host.ts 的可选字段分支降级。
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
  const agents = (ctx as unknown as { readonly agents?: AgentStoreLike }).agents;
  const host = new SessionManagerHost(hostServicesOf(ctx), {
    contextInstaller: makeContextInstaller(agents === undefined ? {} : { agents }),
  });
  for (const tool of buildSessionTools(host)) {
    ctx.tools.register(tool);
  }
}
