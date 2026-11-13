export interface CheckIssue {
  readonly path: string;
  readonly rule: string;
  readonly message: string;
}

export interface CheckResult {
  readonly ok: boolean;
  readonly errors: readonly CheckIssue[];
  readonly warnings: readonly CheckIssue[];
  readonly fixed: readonly CheckIssue[];
  readonly updated: readonly string[];
}

export interface CheckOptions {
  readonly domainsPath?: string;
  readonly limits?: Record<string, number>;
  readonly domain?: string;
  readonly plan?: string;
  readonly strict?: boolean;
}

/** 一条名字规则问题的形态；`blocking` 为真时调用方应跳过后续校验。 */
export interface NameProblem {
  readonly rule: string;
  readonly message: string;
  readonly blocking: boolean;
}

/** 文档 name 的确定性校验；规则只有 `lib/base.mjs` 一处实现。 */
export const nameProblem: (value: unknown, kind: string) => NameProblem | null;

export type FrontmatterResult =
  | { readonly kind: "missing" }
  | { readonly kind: "invalid"; readonly detail: string }
  | { readonly kind: "ok"; readonly data: Record<string, unknown>; readonly body: string };

/** 解析 `--- … ---` YAML 头；侧栏与校验共用。 */
export const parseFrontmatter: (content: string) => FrontmatterResult;

/** 名字规则常量；`create` 与 `check` 共用，不在各自模块重复定义。 */
export const KEBAB: RegExp;
export const PLAN_NAME: RegExp;
export const NUMBERED_NAME: RegExp;
export const HAN: RegExp;
export const isValidDate: (value: string) => boolean;
export const LIFECYCLES: readonly string[];

export const checkWorkspace: (rootDirectory: string, options?: CheckOptions) => CheckResult;
