/**
 * 校验入口：直接调用随包的 `check-domain.mjs`，不启子进程。
 * 规则与索引生成只有这一处实现；这里只负责参数形状与给模型看的文本。
 * @module @kxh4892636/pi-toolkit/nano-flow/check-runner
 */

import { DEFAULT_DOMAIN_ROOT } from "./config.ts";
import { checkWorkspace, type CheckIssue, type CheckResult } from "./scripts/check-domain.mjs";

export type { CheckIssue, CheckResult };

/** 一次校验的可选过滤。 */
export interface CheckOptions {
  readonly domain?: string;
  readonly plan?: string;
  readonly strict?: boolean;
}

/**
 * 校验工作区并生成索引。
 * @param workspace - 工作区根。
 * @param limits - `nanoFlow` 的 8 项篇幅上限（字节/字）。
 * @param options - domain / plan / strict 过滤。
 * @returns 校验结果。
 */
export const runCheck = (
  workspace: string,
  limits: Record<string, number>,
  options: CheckOptions = {},
): CheckResult => {
  return checkWorkspace(workspace, {
    domainsPath: DEFAULT_DOMAIN_ROOT,
    limits,
    ...options,
  });
};

/** 把校验问题渲染成给模型看的文本。 */
export const formatIssues = (issues: readonly CheckIssue[]): string =>
  issues.map((issue) => `${issue.path}: [${issue.rule}] ${issue.message}`).join("\n");
