/**
 * Nano Flow 的会话模式状态与恢复种子。
 *
 * 模式来源有两层：`pi-toolkit.json` 的 `nanoFlow.always` 是全局默认，
 * 当前分支最后一条 `nano-flow-mode` 自定义 entry 是会话级覆盖。
 * 生效值还要与 `/toolkit` 的 `tools.nanoFlow` 开关相与。
 * @module @kxh4892636/pi-toolkit/nano-flow/mode
 */

import { activePlans, listPlans, planRefOf } from "./plan.ts";

/** 会话模式 entry 的 customType。 */
export const MODE_ENTRY = "nano-flow-mode";

/** 上下文重置标记 entry 的 customType。 */
export const RESET_ENTRY = "nano-flow-reset";

/** 分支里的最小 entry 形状。 */
export interface BranchEntryLike {
  readonly type: string;
  readonly customType?: string;
  readonly data?: unknown;
}

/** 会话级模式覆盖；没有记录时为 undefined。 */
export const sessionModeOf = (entries: readonly BranchEntryLike[]): boolean | undefined => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== MODE_ENTRY) continue;
    const enabled = (entry.data as { enabled?: unknown } | undefined)?.enabled;
    if (typeof enabled === "boolean") return enabled;
  }
  return undefined;
};

/** 最近一次上下文重置的时间戳（毫秒）；没有时为 undefined。 */
export const latestResetAt = (entries: readonly BranchEntryLike[]): number | undefined => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== RESET_ENTRY) continue;
    const at = (entry.data as { at?: unknown } | undefined)?.at;
    if (typeof at === "number" && Number.isFinite(at)) return at;
  }
  return undefined;
};

/**
 * 计算当前分支是否运行 Nano Flow。
 * @param entries - 当前分支。
 * @param options - 开关与全局默认。
 * @returns 是否生效。
 */
export const isNanoFlowActive = (
  entries: readonly BranchEntryLike[],
  options: { readonly switchOn: boolean; readonly always: boolean },
): boolean => {
  if (!options.switchOn) return false;
  return sessionModeOf(entries) ?? options.always;
};

/**
 * 构造上下文重置后的恢复种子：优先指名工作区里唯一的 active Plan。
 * @param workspace - 工作区根。
 * @param domainRoot - 领域根。
 * @returns 作为首个 user 消息的种子文本。
 */
export const buildSeed = async (workspace: string, domainRoot: string): Promise<string> => {
  let planReference: string | undefined;
  let planCount = 0;
  try {
    const plans = activePlans(await listPlans(workspace, domainRoot));
    planCount = plans.length;
    const only = plans[0];
    if (plans.length === 1 && only !== undefined) planReference = planRefOf(only);
  } catch {
    planCount = 0;
  }
  const head =
    planReference !== undefined
      ? `恢复当前 Plan：${planReference}`
      : planCount === 0
        ? "当前没有 active Plan：先按 CONTEXT-MAP 定位业务域；没有就新建，然后用 nano_flow_write 的 init 建 Plan 并 create 首条 note（拷问与定案记录）"
        : "工作区有多个 active 的 Plan：先问用户是哪个";
  return [
    "（上下文已达阈值并清空；Plan 在磁盘上，状态不丢。）",
    `${head}。`,
    "先调 nano_flow_read 的 resume 拿恢复包，再读 spec.md 与 story.md，只读报告进度与可推进队列，等用户放行后再执行。",
  ].join("");
};
