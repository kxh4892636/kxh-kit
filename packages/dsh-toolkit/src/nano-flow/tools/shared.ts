import type { PlanRef } from "../plan.js";
import type { NoteNode, PlanDocument } from "../dag.js";
import type { Config } from "../config.js";
import type { NanoFlowSettings } from "../../contract.js";
import type {
  HostServices,
  ToolExecContext,
  ToolTextBlock,
  WorkingDirectoryService,
} from "../services.js";

/** 三个工具共享的运行期依赖。 */
export interface ToolRuntime {
  readonly services: HostServices;
  readonly config: Config;
  /** 当前生效的上限；每次调用重新读取，面板改设置后立即生效。 */
  limits(): NanoFlowSettings;
  readonly assetsRoot: string;
  /** 领域根：配置值或默认 `.agents/domains`。 */
  readonly domainRoot: string;
  /** 解析本会话的工作区根。 */
  workspace(exec: ToolExecContext): Promise<string>;
}

/** 统一把工具结果渲染成一段文本。 */
export const textBlocks = (value: unknown): readonly ToolTextBlock[] => {
  return [{ type: "text", text: String(value) }];
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/** 把模型传入的参数收窄成对象。 */
export const asArguments = (raw: unknown): Record<string, unknown> => {
  if (!isRecord(raw)) throw new Error("工具参数必须是对象");
  return raw;
};

/** 读取可选字符串参数。 */
export const optionalString = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${key} 必须是字符串`);
  return value;
};

/** 读取必填字符串参数。 */
export const requiredString = (args: Record<string, unknown>, key: string): string => {
  const value = optionalString(args, key);
  if (value === undefined || value.trim() === "") throw new Error(`${key} 必填`);
  return value;
};

/** 读取可选字符串数组参数。 */
export const optionalStringArray = (
  args: Record<string, unknown>,
  key: string,
): string[] | undefined => {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${key} 必须是字符串数组`);
  }
  return value as string[];
};

/** 读取必填字符串数组参数。 */
export const requiredStringArray = (args: Record<string, unknown>, key: string): string[] => {
  const value = optionalStringArray(args, key);
  if (value === undefined || value.length === 0) throw new Error(`${key} 不能为空`);
  return value;
};

/** Plan 状态的一行摘要。 */
export const statusLine = (document: PlanDocument): string => {
  const count = (status: NoteNode["status"]): number =>
    document.notes.filter((note) => note.status === status).length;
  const total = document.notes.length;
  return `notes ${total}（completed ${count("completed")} / in_progress ${count(
    "in_progress",
  )} / waiting ${count("waiting")} / pending ${count("pending")}）`;
};

/** 一条 note 的列表行。 */
export const formatNoteLine = (note: NoteNode): string => {
  if (note.status === "waiting" && note.needs === "blocked") {
    const reason = note.blocked_reason ?? "未写明原因";
    return `${note.id} [waiting/blocked] ${note.title} — ${note.description}（${reason}）`;
  }
  const suffix = note.needs === undefined ? "" : `/${note.needs}`;
  return `${note.id} [${note.status}${suffix}] ${note.title} — ${note.description}`;
};

/** Plan 头：引用、状态与 notes 统计。 */
export const formatPlanHeader = (plan: PlanRef, document: PlanDocument): string => {
  return [
    `Plan: ${plan.domain}/${plan.lifecycle}/${plan.name}`,
    `状态: ${statusLine(document)}`,
  ].join("\n");
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * 把 cordis 上下文解析成共享运行期依赖。
 * @param services - 宿主能力。
 * @param config - 插件配置。
 * @param limits - 生效上限。
 * @param assetsRoot - 资产目录。
 * @param domainRoot - 领域根。
 * @returns 运行期依赖。
 */
export const createToolRuntime = (options: {
  services: HostServices;
  config: Config;
  settings: () => NanoFlowSettings;
  assetsRoot: string;
  domainRoot: string;
}): ToolRuntime => {
  const { services, config, settings, assetsRoot, domainRoot } = options;
  return {
    services,
    config,
    limits: settings,
    assetsRoot,
    domainRoot,
    async workspace(exec: ToolExecContext): Promise<string> {
      if (config.workspace !== undefined) return config.workspace;
      const workingDirectory = services.get("workingDirectory") as
        | WorkingDirectoryService
        | undefined;
      if (exec.agent !== undefined && workingDirectory !== undefined) {
        try {
          return await workingDirectory.ensure(exec.agent, exec.signal);
        } catch (error) {
          services.logger.warn(
            `nano-flow: 读取会话工作目录失败，回落到进程目录: ${describeError(error)}`,
          );
        }
      }
      return process.cwd();
    },
  };
};
