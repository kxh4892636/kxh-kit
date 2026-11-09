/**
 * dream 的扫描范围：`.agents/domains/*` 下每个域取最新的若干个 active / reference Plan。
 *
 * 「最新」按 Plan 目录名里的 `YYYY-MM-DD` 前缀倒序 —— 目录名由 `nano_flow_create` 生成，
 * 稳定且不依赖文件 mtime；没有日期前缀的目录排在最后。`archived` 不参与。
 * @module @kxh4892636/pi-toolkit/nano-flow/dream/scope
 */

import { statSync } from "node:fs";
import { join } from "node:path";

import { PLAN_LOG_FILE } from "../log.ts";
import { listPlans, type PlanRef } from "../plan.ts";

/** dream 处理的一个 Plan：定位信息 + 是否存在轨迹文件。 */
export interface DreamPlan {
  readonly plan: PlanRef;
  /** `<plan>/log.jsonl` 的字节数；0 表示还没有轨迹。 */
  readonly logBytes: number;
}

/** 一个业务域及其候选 Plan。 */
export interface DreamDomain {
  readonly domain: string;
  readonly plans: readonly DreamPlan[];
}

/** 一次 dream 运行的范围。 */
export interface DreamScope {
  readonly domains: readonly DreamDomain[];
  /** 参与本次运行的 Plan 总数。 */
  readonly totalPlans: number;
}

/** 目录名里的日期前缀。 */
const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/u;

const dateOf = (name: string): string => DATE_PREFIX.exec(name)?.[1] ?? "";

/** 日期倒序；同日按名字倒序（名字里也带时间/序号信息）。 */
const newestFirst = (left: PlanRef, right: PlanRef): number => {
  const byDate = dateOf(right.name).localeCompare(dateOf(left.name));
  return byDate !== 0 ? byDate : right.name.localeCompare(left.name, "zh-CN");
};

const logBytesOf = (directory: string): number => {
  try {
    return statSync(join(directory, PLAN_LOG_FILE)).size;
  } catch {
    return 0;
  }
};

/** dream 只扫这两个生命周期。 */
const IN_SCOPE = new Set(["active", "reference"]);

/**
 * 选出一次 dream 要处理的域与 Plan。
 * @param workspace - 工作区根。
 * @param options - 领域根与每域上限。
 * @returns 按域名字母序、域内按目录名日期倒序的范围。
 */
export const selectDreamScope = async (
  workspace: string,
  options: { readonly domainRoot: string; readonly maxPlansPerDomain: number },
): Promise<DreamScope> => {
  const plans = (await listPlans(workspace, options.domainRoot)).filter((plan) =>
    IN_SCOPE.has(plan.lifecycle),
  );
  const byDomain = new Map<string, PlanRef[]>();
  for (const plan of plans) {
    const list = byDomain.get(plan.domain);
    if (list === undefined) byDomain.set(plan.domain, [plan]);
    else list.push(plan);
  }
  const domains: DreamDomain[] = [...byDomain.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
    .map(([domain, list]) => ({
      domain,
      plans: [...list]
        .sort(newestFirst)
        .slice(0, Math.max(1, options.maxPlansPerDomain))
        .map((plan) => ({ plan, logBytes: logBytesOf(plan.directory) })),
    }));
  return {
    domains,
    totalPlans: domains.reduce((sum, item) => sum + item.plans.length, 0),
  };
};
