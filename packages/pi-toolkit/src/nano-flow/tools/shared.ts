/**
 * 三个 `nano_flow_*` 工具共享的运行期依赖与文本工具。
 * @module @kxh4892636/pi-toolkit/nano-flow/tools/shared
 */

import type { ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { assetsCheckScript } from "../assets.ts";
import type { NanoFlowSettings } from "../config.ts";
import type { NoteNode, PlanDocument } from "../dag.ts";
import type { PlanRef } from "../plan.ts";

/** 工具共享的运行期依赖。 */
export interface ToolRuntime {
  /** 当前生效的上限；每次调用重新读取。 */
  limits(): NanoFlowSettings;
  /** 领域根（相对工作区根或绝对路径）。 */
  readonly domainRoot: string;
  /** 当前会话工作区根。 */
  workspace(ctx: ExtensionToolContext): string;
}

/** 工具执行结果里的一段模型可见文本。 */
export interface ToolTextBlock {
  readonly type: "text";
  readonly text: string;
}

/** 统一把工具结果渲染成一段文本。 */
export const textBlocks = (value: unknown): ToolTextBlock[] => {
  return [{ type: "text", text: String(value) }];
};

/** 工具执行结果；`details` 原样回传给 pi 的渲染层。 */
export interface ToolOutput<TDetails = unknown> {
  content: ToolTextBlock[];
  details: TDetails;
}

/** 构造 pi 工具定义的最小结构（参数与执行结果都由调用方提供）。 */
export type NanoFlowTool = ToolDefinition;

/** 校验脚本路径；写入与校验工具都用同一份实现。 */
export const checkScriptPath = (): string => assetsCheckScript();

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
  )} / awaiting_verification ${count("awaiting_verification")} / blocked ${count(
    "blocked",
  )} / pending ${count("pending")}）`;
};

/** 一条 note 的列表行。 */
export const formatNoteLine = (note: NoteNode): string => {
  if (note.status === "blocked") {
    const reason = note.blocked_reason ?? "未写明原因";
    return `${note.id} [blocked] ${note.title} — ${note.description}（${reason}）`;
  }
  return `${note.id} [${note.status}] ${note.title} — ${note.description}`;
};

/** Plan 头：引用、状态与 notes 统计。 */
export const formatPlanHeader = (plan: PlanRef, document: PlanDocument): string => {
  return [
    `Plan: ${plan.domain}/${plan.lifecycle}/${plan.name}`,
    `状态: ${statusLine(document)}`,
  ].join("\n");
};

/**
 * 把 pi 扩展上下文收窄成共享运行期依赖。
 * @param options - 上限读取器与领域根。
 * @returns 运行期依赖。
 */
export const createToolRuntime = (options: {
  limits: () => NanoFlowSettings;
  domainRoot: string;
}): ToolRuntime => {
  return {
    limits: options.limits,
    domainRoot: options.domainRoot,
    workspace(ctx: ExtensionToolContext): string {
      return ctx.cwd;
    },
  };
};
