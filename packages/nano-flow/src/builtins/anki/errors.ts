import type { JsonValue } from "../../cli/types";

interface JsonErrorContext {
  readonly action?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly hint?: string;
}

export class JsonError extends Error {
  readonly action: string | undefined;
  readonly details: Readonly<Record<string, JsonValue>> | undefined;
  readonly hint: string | undefined;

  constructor(message: string, context: JsonErrorContext = {}) {
    super(message);
    this.name = "JsonError";
    this.action = context.action;
    this.details = context.details as Readonly<Record<string, JsonValue>> | undefined;
    this.hint = context.hint;
  }
}

export class AnkiOperationError extends Error {
  readonly action: string;
  readonly hint: string | undefined;
  readonly details: Readonly<Record<string, JsonValue>> | undefined;

  constructor(
    message: string,
    action: string,
    options: {
      readonly details?: Readonly<Record<string, JsonValue>>;
      readonly hint?: string;
    } = {},
  ) {
    super(message);
    this.name = "AnkiOperationError";
    this.action = action;
    this.hint = options.hint;
    this.details = options.details;
  }
}

export class ReadOnlyModeError extends AnkiOperationError {
  constructor(action: string) {
    super(
      `Action "${action}" is blocked: Anki is running in read-only mode. Remove --read-only to enable writes.`,
      action,
    );
    this.name = "ReadOnlyModeError";
  }
}

/** 上游(fetch/AnkiConnect)失败的文案, 非 Error 抛出物也要有稳定的字符串表示。 */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** 上游只在文案上区分「对象不存在」, 这些标记命中时改用 notFoundHint。 */
const notFoundMarkers = ["not found", "does not exist"] as const;

export interface JsonErrorTranslation {
  readonly action: string;
  readonly details?: Readonly<Record<string, unknown>> | undefined;
  /** 通用失败提示。 */
  readonly hint?: string | undefined;
  /** 命中 markers 时的提示; 省略则不做区分。 */
  readonly notFoundHint?: string | undefined;
  /** 覆盖默认的 notFoundMarkers。 */
  readonly markers?: readonly string[] | undefined;
}

/**
 * 把上游错误统一翻译成 JsonError(已经是 JsonError 的原样返回, 由调用方 throw)。
 * action 与提示文案属于 CLI 输出契约, 因此逐条由调用方给出而不是在这里推断。
 */
export const translateJsonError = (
  error: unknown,
  translation: JsonErrorTranslation,
): JsonError => {
  if (error instanceof JsonError) return error;
  const message = errorMessage(error);
  const markers = translation.markers ?? notFoundMarkers;
  const notFoundHint = translation.notFoundHint;
  const hint =
    notFoundHint !== undefined &&
    markers.some((marker: string): boolean => message.includes(marker))
      ? notFoundHint
      : translation.hint;
  return new JsonError(message, {
    action: translation.action,
    ...(translation.details === undefined ? {} : { details: translation.details }),
    ...(hint === undefined ? {} : { hint }),
  });
};

/**
 * 笔记类型命令共用两套失败提示: 只涉及模型的命令(样式/模板/加字段)与
 * 涉及具体字段的命令(删/改名/移位)。上游文案一致, 因此集中在这里。
 */
export const modelFailureHints = {
  model: {
    notFoundHint: "Model not found. Use models list to see available models.",
    hint: "Make sure Anki is running and the model name is correct.",
  },
  modelField: {
    notFoundHint: "Model or field not found. Use models list and models fields to verify names.",
    hint: "Make sure Anki is running and the model and field names are correct.",
  },
} as const;
