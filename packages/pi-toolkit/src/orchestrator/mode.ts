/**
 * Orchestrator 的会话模式状态与恢复种子。
 *
 * 模式来源有两层：`pi-toolkit.json` 的 `orchestrator.always` 是全局默认，
 * 当前分支最后一条 `orchestrator-mode` 自定义 entry 是会话级覆盖。
 * 生效值还要与 `/toolkit` 的 `tools.orchestrator` 开关相与。
 * @module @kxh4892636/pi-toolkit/orchestrator/mode
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";

import { activePlans, listPlans, planRefOf, resolvePlan, type PlanRef } from "./plan.ts";

/** 会话模式 entry 的 customType。 */
export const MODE_ENTRY = "orchestrator-mode";

/** 上下文重置标记 entry 的 customType。 */
export const RESET_ENTRY = "orchestrator-reset";

/** 当前 Plan 标记 entry 的 customType：轮转种子的事实源。 */
export const CURRENT_PLAN_ENTRY = "orchestrator-current-plan";

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

/**
 * 本会话记录过的“当前 Plan”（绝对目录）。
 *
 * 轮转的种子必须指名一个 Plan，而这个事实不在磁盘上：写进会话 entry 才能在重启 /
 * 上下文清空后照样读到。取最后一条，早期记录可能是别的 Plan。
 * @param entries - 当前分支。
 * @returns Plan 目录的绝对路径；没有记录时为 undefined。
 */
export const currentPlanOf = (entries: readonly BranchEntryLike[]): string | undefined => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== CURRENT_PLAN_ENTRY) continue;
    const directory = (entry.data as { directory?: unknown } | undefined)?.directory;
    if (typeof directory === "string" && directory !== "") return directory;
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
 * 计算当前分支是否运行 Orchestrator。
 * @param entries - 当前分支。
 * @param options - 开关与全局默认。
 * @returns 是否生效。
 */
export const isOrchestratorActive = (
  entries: readonly BranchEntryLike[],
  options: { readonly switchOn: boolean; readonly always: boolean },
): boolean => {
  if (!options.switchOn) return false;
  return sessionModeOf(entries) ?? options.always;
};

/** 把“当前 Plan 目录”解析成 Plan 定位信息；目录已不存在（被 move / 删掉）时为 undefined。 */
const planAt = async (
  workspace: string,
  domainRoot: string,
  directory: string | undefined,
): Promise<PlanRef | undefined> => {
  if (directory === undefined) return undefined;
  try {
    return await resolvePlan(workspace, domainRoot, directory);
  } catch {
    return undefined;
  }
};

/**
 * 会话里没有“当前 Plan”这个事实时的降级：取 notes.json 最近更新的 active Plan。
 *
 * 曾经的写法是让用户挑，但那把一次恢复变成一轮问答；轮转的本意是**接着干**。
 * 取最近更新的那个是可解释的确定性选择，真要换 Plan 用户下一句会说。
 * @param plans - active Plan 列表。
 * @returns 最近更新的 Plan（都读不到时间时取第一个）。
 */
const mostRecentlyUpdated = async (plans: readonly PlanRef[]): Promise<PlanRef | undefined> => {
  let picked: PlanRef | undefined;
  let pickedAt = Number.NEGATIVE_INFINITY;
  for (const plan of plans) {
    try {
      const info = await stat(join(plan.directory, "notes.json"));
      if (info.mtimeMs > pickedAt) {
        picked = plan;
        pickedAt = info.mtimeMs;
      }
    } catch {
      // 读不到时间就跳过：它可能是刚被 move / 删掉的 Plan。
    }
  }
  return picked ?? plans[0];
};

/**
 * 构造上下文重置后的恢复种子：指名“当前 Plan”，不问用户挑。
 *
 * 事实源优先级：`currentPlanDirectory`（会话记录 / 最后一次命中的 Plan）→ 唯一的
 * active Plan → 最近更新的 active Plan。只有在工作区根本没有 active Plan 时才让模型
 * 去建一个。
 * @param workspace - 主工作区根。
 * @param domainRoot - 领域根。
 * @param currentPlanDirectory - 会话记录的当前 Plan 目录（绝对路径）。
 * @returns 作为首个 user 消息的种子文本。
 */
export const buildSeed = async (
  workspace: string,
  domainRoot: string,
  currentPlanDirectory?: string,
): Promise<string> => {
  let plans: readonly PlanRef[] = [];
  try {
    plans = activePlans(await listPlans(workspace, domainRoot));
  } catch {
    plans = [];
  }
  const recorded = await planAt(workspace, domainRoot, currentPlanDirectory);
  const only = plans.length === 1 ? plans[0] : undefined;
  const fallback =
    recorded === undefined && only === undefined && plans.length > 1
      ? await mostRecentlyUpdated(plans)
      : undefined;
  const current = recorded ?? only ?? fallback;
  const head =
    current !== undefined
      ? [
          `恢复当前 Plan：${planRefOf(current)}（目录 ${current.directory}）`,
          fallback === undefined
            ? ""
            : "（会话里没有更早的当前 Plan 记录，取最近更新的那个；不要问用户挑 Plan）",
        ].join("")
      : plans.length === 0
        ? "当前没有 active Plan：先按 CONTEXT-MAP 定位业务域；没有就新建，然后用 orchestrator_write 的 init 建 Plan 并 create 首条 note（拷问与定案记录）"
        : `工作区有 ${plans.length} 个 active 的 Plan 但都没读到：先调 orchestrator_read 的 plans 核对，取最近更新的那个继续，不要问用户挑 Plan`;
  return [
    "（上下文已达阈值并清空；Plan 在磁盘上，状态不丢。）",
    `${head}。`,
    "先调 orchestrator_read 的 resume 拿恢复包，再读 spec.md 与 story.md，只读报告进度与可推进队列，等用户放行后再执行。",
  ].join("");
};
