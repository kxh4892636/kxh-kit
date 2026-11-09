/**
 * 三个 Nano Flow 工具共享的极简运行期依赖与参数读取。
 * 不做服务抽象、不做宿主探测：pi 的工具上下文已经给出 cwd，绑定与设置由 register 注入。
 * @module @kxh4892636/pi-toolkit/nano-flow/tools/shared
 */

import type { NanoFlowSettings } from "../config.ts";

/** 工具运行期依赖。 */
export interface NanoDeps {
  /** 当前生效的 Nano Flow 设置（每次调用重读）。 */
  readonly settings: () => NanoFlowSettings;
  /** 包内模板目录。 */
  readonly templatesRoot: string;
  /** 写入当前会话的 Plan 绑定（由 register 用 pi.appendEntry 实现）。 */
  readonly bind: (planDirectory: string, workspace: string) => void;
}

/** 把模型参数收窄成对象。 */
export const asArguments = (raw: unknown): Record<string, unknown> => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("工具参数必须是对象");
  }
  return raw as Record<string, unknown>;
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
