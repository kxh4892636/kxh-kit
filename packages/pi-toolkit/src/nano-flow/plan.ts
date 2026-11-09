/**
 * Plan 扫描与解析：以 `spec.md` 作为 Plan 存在的标志。
 * 只保留 Nano Flow 真正需要的部分：按目录列出、按名字/域/生命周期唯一定位、目录与引用互转。
 * @module @kxh4892636/pi-toolkit/nano-flow/plan
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

/** Plan 生命周期目录，顺序即创建时的推荐顺序。 */
export const PLAN_LIFECYCLES = ["active", "reference", "archived"] as const;

export type PlanLifecycle = (typeof PLAN_LIFECYCLES)[number];

/** 一个 Plan 的定位信息。 */
export interface PlanRef {
  readonly domain: string;
  readonly lifecycle: PlanLifecycle;
  readonly name: string;
  /** Plan 目录的绝对路径。 */
  readonly directory: string;
}

/** 判断字符串是否是可用的生命周期名。 */
export const isPlanLifecycle = (value: string): value is PlanLifecycle =>
  (PLAN_LIFECYCLES as readonly string[]).includes(value);

/** 把 Plan 定位信息还原成 `<domain>/<lifecycle>/<name>`。 */
export const planRefOf = (plan: PlanRef): string => `${plan.domain}/${plan.lifecycle}/${plan.name}`;

/** 领域根的绝对路径。 */
export const domainsDirectoryOf = (workspace: string, domainRoot: string): string =>
  isAbsolute(domainRoot) ? domainRoot : join(workspace, domainRoot);

const directories = async (directory: string): Promise<readonly string[]> => {
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

/** 列出工作区里的全部 Plan。 */
export const listPlans = async (
  workspace: string,
  domainRoot: string,
): Promise<readonly PlanRef[]> => {
  const domains = domainsDirectoryOf(workspace, domainRoot);
  const plans: PlanRef[] = [];
  for (const domain of await directories(domains)) {
    const plansRoot = join(domains, domain, "plans");
    for (const lifecycle of await directories(plansRoot)) {
      if (!isPlanLifecycle(lifecycle)) continue;
      for (const name of await directories(join(plansRoot, lifecycle))) {
        const directory = join(plansRoot, lifecycle, name);
        if (existsSync(join(directory, "spec.md"))) {
          plans.push({ domain, lifecycle, name, directory });
        }
      }
    }
  }
  return plans;
};

/** 只保留 active 的 Plan。 */
export const activePlans = (plans: readonly PlanRef[]): readonly PlanRef[] =>
  plans.filter((plan) => plan.lifecycle === "active");

/** 按目录名定位 Plan；同名时用 domain / lifecycle 消歧。 */
export const resolvePlan = async (
  workspace: string,
  domainRoot: string,
  options: { readonly plan: string; readonly domain?: string; readonly lifecycle?: string },
): Promise<PlanRef> => {
  const matches = (await listPlans(workspace, domainRoot)).filter(
    (plan) =>
      plan.name === options.plan &&
      (options.domain === undefined || plan.domain === options.domain) &&
      (options.lifecycle === undefined || plan.lifecycle === options.lifecycle),
  );
  if (matches.length === 0) {
    throw new Error(
      `找不到 Plan: ${options.plan}${options.domain === undefined ? "" : `（domain=${options.domain}）`}`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `找到多个同名 Plan，请补 domain 或 lifecycle：${matches.map(planRefOf).join("、")}`,
    );
  }
  return matches[0] as PlanRef;
};

/** 从 Plan 目录反推 `<domain>/<lifecycle>/<name>`；形状不符时 undefined。 */
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
