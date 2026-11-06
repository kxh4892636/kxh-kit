import type { NanoFlowSettings } from "../contract.js";

/** 根插件提供给预设内插件的服务名。 */
export const NANO_FLOW_SERVICE = "toolkitNanoFlow";

/**
 * 根插件（toolkit）对预设内 nano-flow 插件暴露的窄接口。
 *
 * 设置文件与会话隐藏清单都归根插件管：预设插件只读设置、只登记删除结果，
 * 避免两个实例同时写同一个状态文件。
 */
export interface ToolkitNanoFlowFacade {
  /** 当前生效的上限与轮转阈值。 */
  settings(): NanoFlowSettings;
  /** 合并并落盘设置。 */
  updateSettings(patch: unknown): Promise<NanoFlowSettings>;
  /** 把已物理删除的会话登记为「隐藏」并广播，客户端列表不再显示。 */
  announceRemoved(sessionId: string): Promise<void>;
  /** 删除失败时登记为「下次启动再删」。 */
  recordPendingDelete(sessionId: string): Promise<void>;
  /** 会话日志根（`$DSH_HOME/sessions`）。 */
  sessionsRoot(): string;
}
