/**
 * Orchestrator 的领域根与数值上限。
 *
 * 上限统一放在 `pi-toolkit.json` 的 `orchestrator` 节；工具每次调用重新读取，
 * 校验脚本以 `--limits` 收到同一份数字。领域根固定为 `.agents/domains`，
 * 与工作区 `CONTEXT-MAP.md` 的约定一致。
 * @module @kxh4892636/pi-toolkit/orchestrator/config
 */

/** 默认领域根；与 `prompt.md` 的约定一致。 */
export const DEFAULT_DOMAIN_ROOT = ".agents/domains";

/** 领域文档与 Plan 的体积/数量上限、会话重置阈值。 */
export interface OrchestratorSettings {
  /** story.md 单文件上限（字节）。 */
  readonly storyMaxBytes: number;
  /** spec.md 单文件上限（字节）。 */
  readonly specMaxBytes: number;
  /** 单条 note 正文上限（字节）。 */
  readonly noteMaxBytes: number;
  /** note 摘要字数上限。 */
  readonly noteDescriptionMaxChars: number;
  /** 关键索引行数上限。 */
  readonly indexMaxRows: number;
  /** CONTEXT.md 上限（字节）。 */
  readonly contextMaxBytes: number;
  /** QUESTIONS.md 上限（字节）。 */
  readonly questionsMaxBytes: number;
  /** 单个 ADR 上限（字节）。 */
  readonly adrMaxBytes: number;
  /** 单个域的 ADR 数量上限。 */
  readonly adrMaxCount: number;
  /** 上下文占用达到该比例后清空并恢复 Plan（0–1）。 */
  readonly rotateAt: number;
  /**
   * 一个 worker 多久没有进展算超时（毫秒，默认 30 分钟）。
   *
   * 进展只认账本里的 `input.consumed` 与 `report.filed`：派工本身不算进展（它只决定
   * 起点）。超时会中止 worker 并写入账本，之后走「诊断 → 重试」。
   */
  readonly workerTimeoutMs: number;
  /**
   * 软提示阈值（毫秒，默认 15 分钟）：超过它只在 `state` 标「疑似停滞」，**不杀**。
   *
   * 单轮长任务期间账本里没有事件，杀它只会误伤；真正的判据是 `workerTimeoutMs`。
   */
  readonly softStallMs: number;
  /**
   * 同一条 note 超时后最多自动重派几次（默认 2）。
   *
   * 重派不是代码级盲重试：先让只读诊断 worker 给结论，再按建议派下一代；到上限就落
   * `retry.exhausted` 转人工。
   */
  readonly retryLimit: number;
}

/** 默认值：34/34/13 KB、144 字、13 行、89/89/13 KB、55 个 ADR、阈值 0.618。 */
export const DEFAULT_ORCHESTRATOR_SETTINGS: OrchestratorSettings = {
  storyMaxBytes: 34 * 1024,
  specMaxBytes: 34 * 1024,
  noteMaxBytes: 13 * 1024,
  noteDescriptionMaxChars: 144,
  indexMaxRows: 13,
  contextMaxBytes: 89 * 1024,
  questionsMaxBytes: 89 * 1024,
  adrMaxBytes: 13 * 1024,
  adrMaxCount: 55,
  rotateAt: 0.618,
  workerTimeoutMs: 30 * 60 * 1000,
  softStallMs: 15 * 60 * 1000,
  retryLimit: 2,
};

/** 需要是正整数的字段。 */
export const ORCHESTRATOR_INTEGER_KEYS = [
  "storyMaxBytes",
  "specMaxBytes",
  "noteMaxBytes",
  "noteDescriptionMaxChars",
  "indexMaxRows",
  "contextMaxBytes",
  "questionsMaxBytes",
  "adrMaxBytes",
  "adrMaxCount",
  "workerTimeoutMs",
  "softStallMs",
  "retryLimit",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const describe = (value: unknown): string => {
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? typeof value;
};

/**
 * 校验并合并一份上限设置：未知键忽略，整数键必须是正整数，`rotateAt` 必须落在 (0, 1]。
 * @param raw - 待校验的值（可只含部分字段）。
 * @param base - 缺省字段的来源。
 * @returns 完整设置。
 * @throws 任一已知字段非法时。
 */
export const parseOrchestratorSettings = (
  raw: unknown,
  base: OrchestratorSettings = DEFAULT_ORCHESTRATOR_SETTINGS,
): OrchestratorSettings => {
  if (!isRecord(raw)) throw new Error("Config orchestrator 必须是 JSON 对象");
  const result: Record<string, number | boolean> = { ...base };
  for (const key of ORCHESTRATOR_INTEGER_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new Error(`Config orchestrator.${key} 必须是正整数，实际为 ${describe(value)}`);
    }
    result[key] = value;
  }
  const rotateAt = raw["rotateAt"];
  if (rotateAt !== undefined) {
    if (
      typeof rotateAt !== "number" ||
      !Number.isFinite(rotateAt) ||
      rotateAt <= 0 ||
      rotateAt > 1
    ) {
      throw new Error(`Config orchestrator.rotateAt 必须落在 (0, 1]，实际为 ${describe(rotateAt)}`);
    }
    result["rotateAt"] = rotateAt;
  }
  return result as unknown as OrchestratorSettings;
};
