import { todoGroups } from "../nano-flow/dag.js";
import { activePlans, listPlans } from "../nano-flow/plan.js";
import { loadDocument } from "../nano-flow/store.js";
import type { NanoFlowReadyResponse, NanoFlowSettings } from "../contract.js";

/** 读取 ready 面板所需的上下文。 */
export interface ReadNanoFlowReadyOptions {
  /** 会话工作区根。 */
  readonly workspace: string;
  /** 领域根（相对工作区根或绝对路径）。 */
  readonly domainRoot: string;
  /** 当前生效的 notes 上限。 */
  readonly limits: NanoFlowSettings;
}

/**
 * 读取工作区里唯一 active Plan 的未完成 notes，按依赖关系分组。
 *
 * 只读 `notes.json`；没有 active Plan、多个 active Plan 或读取失败时返回不可用，
 * 由客户端隐藏面板。
 * @param options - 工作区、领域根与上限。
 * @returns 面板数据；不可用时带原因。
 */
export const readNanoFlowReady = async (
  options: ReadNanoFlowReadyOptions,
): Promise<NanoFlowReadyResponse> => {
  try {
    const plans = activePlans(await listPlans(options.workspace, options.domainRoot));
    if (plans.length === 0) return { available: false, reason: "no-active-plan" };
    if (plans.length > 1) return { available: false, reason: "multiple-active-plans" };
    const plan = plans[0];
    if (plan === undefined) return { available: false, reason: "no-active-plan" };

    const document = await loadDocument(plan.directory, options.limits);
    const counts = {
      total: document.notes.length,
      pending: 0,
      in_progress: 0,
      waiting: 0,
      blocked: 0,
      completed: 0,
    };
    for (const note of document.notes) counts[note.status] += 1;

    return {
      available: true,
      plan: { domain: plan.domain, lifecycle: plan.lifecycle, name: plan.name },
      counts,
      groups: todoGroups(document.notes).map((group) => ({
        notes: group.notes.map((note) => ({
          id: note.id,
          title: note.title,
          description: note.description,
          status: note.status,
          ...(note.needs === undefined ? {} : { needs: note.needs }),
          blocked_by: note.blocked_by,
          ...(note.blocked_reason === undefined ? {} : { blocked_reason: note.blocked_reason }),
        })),
      })),
    };
  } catch {
    return { available: false, reason: "read-failed" };
  }
};
