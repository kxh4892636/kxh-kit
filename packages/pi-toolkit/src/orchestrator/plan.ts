import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** Plan 生命周期目录，顺序即创建时的推荐顺序。 */
export const PLAN_LIFECYCLES = ["active", "reference", "archived"] as const;

/** 生命周期类型。 */
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
export const isPlanLifecycle = (value: string): value is PlanLifecycle => {
  return (PLAN_LIFECYCLES as readonly string[]).includes(value);
};

/** 把 Plan 定位信息还原成 `<domain>/<lifecycle>/<name>`。 */
export const planRefOf = (plan: PlanRef): string => {
  return `${plan.domain}/${plan.lifecycle}/${plan.name}`;
};

/** 领域根的目录名（与 `DEFAULT_DOMAIN_ROOT` 同构，只是拆成两段便于按路径切分）。 */
const DOMAIN_ROOT_SEGMENTS = [".agents", "domains"] as const;

/**
 * 从一个绝对的 Plan 目录反推工作区根。
 *
 * worktree worker 的 `ctx.cwd` 是 `.worktrees/<名字>`，而 Plan 锚定在主工作区的绝对路径：
 * 只按 cwd 找 `.agents/domains` 会把「lockedPlan 在自己工作区之外」误判为无法识别。
 * 所以只要能认出 `<root>/.agents/domains/<domain>/plans/<lifecycle>/<name>` 的形状，
 * 就把 `<root>` 当作工作区。
 * @param planDirectory - Plan 目录（通常是绝对的）。
 * @returns 工作区根；形状不匹配时 undefined。
 */
export const workspaceOfPlanDirectory = (planDirectory: string): string | undefined => {
  if (!isAbsolute(planDirectory)) return undefined;
  const segments = planDirectory.split(/[\\/]+/u);
  for (let at = segments.length - 5; at >= 0; at -= 1) {
    const isRoot =
      segments[at] === DOMAIN_ROOT_SEGMENTS[0] &&
      segments[at + 1] === DOMAIN_ROOT_SEGMENTS[1] &&
      segments[at + 3] === "plans";
    if (!isRoot) continue;
    if (segments[at + 4] === undefined) continue;
    const root = segments.slice(0, at).join(sep);
    if (root === "" || !existsSync(join(root, ...DOMAIN_ROOT_SEGMENTS))) continue;
    return root;
  }
  return undefined;
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
        // 旧 Markdown Plan（没有 notes.json）当作不存在：既不列出，也不参与解析。
        if (!existsSync(join(directory, "notes.json"))) continue;
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

const fromDirectory = (
  workspace: string,
  domainsPath: string,
  directory: string,
): PlanRef | undefined => {
  const domainsDirectory = isAbsolute(domainsPath) ? domainsPath : join(workspace, domainsPath);
  const relativePath = relative(domainsDirectory, directory);
  if (relativePath.startsWith("..")) return undefined;
  const segments = relativePath.split(sep);
  if (segments.length !== 4) return undefined;
  const [domain, plans, lifecycle, name] = segments;
  if (domain === undefined || plans !== "plans" || lifecycle === undefined || name === undefined) {
    return undefined;
  }
  if (!isPlanLifecycle(lifecycle)) return undefined;
  return { domain, lifecycle, name, directory };
};

/**
 * 解析一个 Plan 引用。
 *
 * 支持三种写法：`<domain>/<lifecycle>/<name>`、工作区内的目录路径、绝对路径。
 * 省略引用时要求工作区里恰好只有一个 active 的 Plan。
 * @param workspace - 工作区根。
 * @param domainsPath - 领域根。
 * @param ref - Plan 引用。
 * @returns 定位信息。
 */
export const resolvePlan = async (
  workspace: string,
  domainsPath: string,
  ref?: string,
): Promise<PlanRef> => {
  const trimmed = ref?.trim();
  if (trimmed !== undefined && trimmed !== "") {
    if (!trimmed.includes("/") || trimmed.split("/").filter(Boolean).length === 3) {
      const segments = trimmed.split("/").filter(Boolean);
      if (segments.length === 3) {
        const [domain, lifecycle, name] = segments;
        if (domain === undefined || lifecycle === undefined || name === undefined) {
          throw new Error(`无法识别 Plan 引用: ${trimmed}`);
        }
        if (!isPlanLifecycle(lifecycle)) {
          throw new Error(`Plan 引用的生命周期无效: ${lifecycle}`);
        }
        const directory = join(
          isAbsolute(domainsPath) ? domainsPath : join(workspace, domainsPath),
          domain,
          "plans",
          lifecycle,
          name,
        );
        if (!existsSync(join(directory, "notes.json"))) {
          throw new Error(`Plan 不存在: ${trimmed}（缺 notes.json 的目录 ${directory}）`);
        }
        return { domain, lifecycle, name, directory };
      }
    }
    const directory = isAbsolute(trimmed) ? trimmed : resolve(workspace, trimmed);
    const parsed = fromDirectory(workspace, domainsPath, directory);
    if (parsed !== undefined && existsSync(join(directory, "notes.json"))) return parsed;
    throw new Error(`无法识别 Plan 引用: ${trimmed}`);
  }
  const candidates = activePlans(await listPlans(workspace, domainsPath));
  const only = candidates[0];
  if (candidates.length === 1 && only !== undefined) return only;
  if (candidates.length === 0) {
    throw new Error("工作区里没有 active 的 Plan；先用 orchestrator_write 的 init 建一个");
  }
  throw new Error(
    `工作区里有 ${candidates.length} 个 active 的 Plan，请用 plan 参数指定：${candidates
      .map(planRefOf)
      .join("、")}`,
  );
};
