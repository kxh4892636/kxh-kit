import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

/** Plan 生命周期目录，顺序即创建时的推荐顺序。 */
export const PLAN_LIFECYCLES = ["active", "reference", "archived"] as const;

/** 生命周期类型。 */
type PlanLifecycle = (typeof PLAN_LIFECYCLES)[number];

/** 一个 Plan 的定位信息。 */
export interface PlanRef {
  readonly domain: string;
  readonly lifecycle: PlanLifecycle;
  readonly name: string;
  /** Plan 目录的绝对路径。 */
  readonly directory: string;
}

/** 判断字符串是否是可用的生命周期名。 */
export const isPlanLifecycle = (value: string): value is PlanLifecycle => {
  return (PLAN_LIFECYCLES as readonly string[]).includes(value);
};

/** 把 Plan 定位信息还原成 `<domain>/<lifecycle>/<name>`。 */
export const planRefOf = (plan: PlanRef): string => {
  return `${plan.domain}/${plan.lifecycle}/${plan.name}`;
};

/**
 * 从 Plan 目录反推 `<domain>/<lifecycle>/<name>`。
 * @param directory - Plan 目录（绝对路径或任意分隔符的相对路径）。
 * @returns 形状不符时 undefined。
 */
export const planRefFromDirectory = (directory: string): string | undefined => {
  const parts = directory.split(/[\\/]/u).filter((part) => part !== "");
  const at = parts.lastIndexOf("plans");
  if (at < 2) return undefined;
  const domain = parts[at - 1];
  const lifecycle = parts[at + 1];
  const name = parts[at + 2];
  if (domain === undefined || name === undefined) return undefined;
  if (!isPlanLifecycle(lifecycle ?? "")) return undefined;
  return `${domain}/${lifecycle}/${name}`;
};

const sortedEntries = async (directory: string): Promise<readonly string[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "zh-CN"));
  } catch {
    return [];
  }
};

/**
 * 列出工作区里的全部 Plan。
 *
 * 以 `spec.md` 为存在标志：story 已并入 spec，notes.json 是旧格式。
 * @param workspace - 工作区根。
 * @param domainsPath - 领域根（相对工作区根或绝对路径）。
 * @returns 按域、生命周期、名称排序的 Plan 列表。
 */
export const listPlans = async (
  workspace: string,
  domainsPath: string,
): Promise<readonly PlanRef[]> => {
  const domainsDirectory = isAbsolute(domainsPath) ? domainsPath : join(workspace, domainsPath);
  const plans: PlanRef[] = [];
  for (const domain of await sortedEntries(domainsDirectory)) {
    const plansDirectory = join(domainsDirectory, domain, "plans");
    for (const lifecycle of await sortedEntries(plansDirectory)) {
      if (!isPlanLifecycle(lifecycle)) continue;
      const lifecycleDirectory = join(plansDirectory, lifecycle);
      for (const name of await sortedEntries(lifecycleDirectory)) {
        const directory = join(lifecycleDirectory, name);
        if (!existsSync(join(directory, "spec.md"))) continue;
        plans.push({ domain, lifecycle, name, directory });
      }
    }
  }
  return plans;
};

/** 只保留仍在推进的 Plan（active）。 */
export const activePlans = (plans: readonly PlanRef[]): readonly PlanRef[] => {
  return plans.filter((plan) => plan.lifecycle === "active");
};
