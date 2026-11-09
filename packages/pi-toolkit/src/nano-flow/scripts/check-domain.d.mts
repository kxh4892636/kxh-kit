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

export const DOMAINS_DIR: string;
export const DEFAULT_LIMITS: Readonly<Record<string, number>>;
export const checkWorkspace: (rootDirectory: string, options?: CheckOptions) => CheckResult;
