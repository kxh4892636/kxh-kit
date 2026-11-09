/**
 * Nano Flow 的默认领域根、设置形状与默认值。数值全部来自 `pi-toolkit.json`
 * 的 `nanoFlow` 节；这里只提供类型与缺省值，不读写文件。
 * @module @kxh4892636/pi-toolkit/nano-flow/config
 */

/** 默认领域根；与提示词里的 `.agents/domains` 约定一致。 */
export const DEFAULT_DOMAIN_ROOT = ".agents/domains";

/** 9 项上限 + 轮转阈值；由 `pi-toolkit.json` 的 `nanoFlow` 节维护。 */
export interface NanoFlowSettings {
  /** spec.md 单文件上限（字节）。 */
  readonly specMaxBytes: number;
  /** 单条 note 正文上限（字节）。 */
  readonly noteMaxBytes: number;
  /** description 的字数上限。 */
  readonly noteDescriptionMaxChars: number;
  /** CONTEXT.md 上限（字节）。 */
  readonly contextMaxBytes: number;
  /** 单个 question 上限（字节）。 */
  readonly questionMaxBytes: number;
  /** 单个 ADR 上限（字节）。 */
  readonly adrMaxBytes: number;
  /** 单个 workflow 上限（字节）。 */
  readonly workflowMaxBytes: number;
  /** GUIDE.md 上限（字节）。 */
  readonly guideMaxBytes: number;
  /** 上下文占用达到该比例后清空历史并注入恢复 seed（0–1）。 */
  readonly rotateAt: number;
}

/** 默认值：34 / 13 KB，233 字，89 / 13 / 13 / 34 / 13 KB，轮转阈值 0.618。 */
export const DEFAULT_NANO_FLOW_SETTINGS: NanoFlowSettings = {
  specMaxBytes: 34 * 1024,
  noteMaxBytes: 13 * 1024,
  noteDescriptionMaxChars: 233,
  contextMaxBytes: 89 * 1024,
  questionMaxBytes: 13 * 1024,
  adrMaxBytes: 13 * 1024,
  workflowMaxBytes: 34 * 1024,
  guideMaxBytes: 13 * 1024,
  rotateAt: 0.618,
};

/** 只把数值字段交给校验脚本；`always` / `domainRoot` 不属于篇幅上限。 */
export const limitsOf = (settings: NanoFlowSettings): Record<string, number> => ({
  specMaxBytes: settings.specMaxBytes,
  noteMaxBytes: settings.noteMaxBytes,
  noteDescriptionMaxChars: settings.noteDescriptionMaxChars,
  contextMaxBytes: settings.contextMaxBytes,
  questionMaxBytes: settings.questionMaxBytes,
  adrMaxBytes: settings.adrMaxBytes,
  workflowMaxBytes: settings.workflowMaxBytes,
  guideMaxBytes: settings.guideMaxBytes,
});
