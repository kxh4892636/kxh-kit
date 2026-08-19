import { AnkiConnectError } from "../client/errors";

export interface JsonErrorContext {
  /** 出错的 AnkiConnect action(若有) */
  action?: string;
  /** 给用户的修复提示(上游 hint 语义) */
  hint?: string;
  /** 附加错误上下文, 展开进错误 JSON */
  details?: Record<string, unknown>;
}

/**
 * 命令层错误: 携带 action/hint/细节上下文, 顶层统一输出为错误 JSON。
 * 若已在 JsonError 中, 不再重复包装。
 */
export class JsonError extends Error {
  readonly action: string | undefined;
  readonly hint: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(message: string, context: JsonErrorContext = {}) {
    super(message);
    this.name = "JsonError";
    this.action = context.action;
    this.hint = context.hint;
    this.details = context.details;
  }
}

export interface ErrorPayload {
  success: false;
  error: string;
  action?: string;
  hint?: string;
  stack?: string;
  [key: string]: unknown;
}

// 统一错误 JSON 形状(ADR-0001): {success:false, error, action?, hint?, ...细节}。
export const toErrorPayload = (error: unknown, debug: boolean): ErrorPayload => {
  const payload: ErrorPayload = {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };

  if (error instanceof JsonError) {
    if (error.action !== undefined) {
      payload.action = error.action;
    }
    if (error.hint !== undefined) {
      payload.hint = error.hint;
    }
    if (error.details !== undefined) {
      Object.assign(payload, error.details);
    }
  } else if (error instanceof AnkiConnectError) {
    if (error.action !== undefined) {
      payload.action = error.action;
    }
  }

  if (debug && error instanceof Error && error.stack !== undefined) {
    payload.stack = error.stack;
  }

  return payload;
};
