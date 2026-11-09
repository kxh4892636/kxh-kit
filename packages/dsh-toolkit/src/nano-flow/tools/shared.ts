import { isAbsolute, join } from "node:path";

import type { NanoFlowSettings } from "../../contract.js";
import type { Config } from "../config.js";
import type {
  HostServices,
  ToolExecContext,
  ToolTextBlock,
  WorkingDirectoryService,
} from "../services.js";

/** 两个工具共享的运行期依赖。 */
export interface ToolRuntime {
  readonly services: HostServices;
  readonly config: Config;
  /** 当前生效的上限；每次调用重新读取，面板改设置后立即生效。 */
  limits(): NanoFlowSettings;
  readonly assetsRoot: string;
  /** 文档模板目录。 */
  readonly templatesRoot: string;
  /** 领域根：配置值或默认 `.agents/domains`。 */
  readonly domainRoot: string;
  /** 解析本会话的工作区根。 */
  workspace(exec: ToolExecContext): Promise<string>;
  /** 领域根的绝对路径。 */
  domainsDirectory(workspace: string): string;
  /** 写入或切换本会话的 Plan 绑定；失败时抛错（显式工具要让用户看到）。 */
  rebind?(exec: ToolExecContext, planDirectory: string, workspace: string): Promise<void>;
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

/** 读取可选布尔参数。 */
export const optionalBoolean = (
  args: Record<string, unknown>,
  key: string,
): boolean | undefined => {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`${key} 必须是布尔值`);
  return value;
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * 把 cordis 上下文解析成共享运行期依赖。
 * @param options - 宿主能力、配置、上限、资产目录与领域根。
 * @returns 运行期依赖。
 */
export const createToolRuntime = (options: {
  services: HostServices;
  config: Config;
  settings: () => NanoFlowSettings;
  assetsRoot: string;
  domainRoot: string;
  /** 宿主侧写绑定表的回调（会话 id → Plan 目录）；覆盖语义。 */
  rebind?: (sessionId: string, planDirectory: string, workspace: string) => Promise<void>;
}): ToolRuntime => {
  const { services, config, settings, assetsRoot, domainRoot } = options;
  const templatesRoot = join(assetsRoot, "templates");
  const domainsDirectory = (workspace: string): string =>
    isAbsolute(domainRoot) ? domainRoot : join(workspace, domainRoot);
  return {
    services,
    config,
    limits: settings,
    assetsRoot,
    templatesRoot,
    domainRoot,
    domainsDirectory,
    async rebind(exec: ToolExecContext, planDirectory: string, workspace: string): Promise<void> {
      const sessionId = (exec.agent as { session?: { id?: string } } | undefined)?.session?.id;
      if (sessionId === undefined) throw new Error("无法确定当前会话，不能绑定 Plan");
      if (options.rebind === undefined) throw new Error("当前宿主未提供 Plan 绑定能力");
      await options.rebind(sessionId, planDirectory, workspace);
    },
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
