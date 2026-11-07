import { execFile } from "node:child_process";

/** 一条校验问题。 */
export interface CheckIssue {
  readonly path: string;
  readonly rule: string;
  readonly message: string;
}

/** 一次校验的结果。 */
export interface CheckResult {
  readonly ok: boolean;
  readonly errors: readonly CheckIssue[];
}

const isIssue = (value: unknown): value is CheckIssue => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["path"] === "string" &&
    typeof record["rule"] === "string" &&
    typeof record["message"] === "string"
  );
};

/**
 * 调用随包分发的校验脚本，保证「校验规则只有一处实现」。
 * @param options - 脚本路径、工作区、域根与可选的 Plan 引用。
 * @returns 解析后的结果；脚本输出无法解析时抛错。
 */
export const runCheck = (options: {
  script: string;
  workspace: string;
  domainsPath: string;
  limits: unknown;
  planRef?: string | undefined;
  /** 只校验这些业务域（worker 用：common + 自己那一个域）。 */
  onlyDomains?: readonly string[] | undefined;
}): Promise<CheckResult> => {
  return new Promise<CheckResult>((resolve, reject) => {
    const args = [
      options.script,
      options.workspace,
      "--domains",
      options.domainsPath,
      "--json",
      "--limits",
      JSON.stringify(options.limits),
      ...(options.planRef === undefined ? [] : ["--plan", options.planRef]),
      ...(options.onlyDomains ?? []).flatMap((domain) => ["--only-domain", domain]),
    ];
    execFile(
      process.execPath,
      args,
      {
        cwd: options.workspace,
        maxBuffer: 8 * 1024 * 1024,
        // 桌面宿主可能跑在 Electron 主进程里：让可执行文件按 Node 解释脚本。
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      },
      (error, stdout, stderr) => {
        const line = stdout
          .trim()
          .split("\n")
          .filter((item) => item.trim() !== "")
          .pop();
        if (line === undefined) {
          reject(
            new Error(
              `校验脚本没有输出: ${
                stderr.trim() === ""
                  ? error instanceof Error
                    ? error.message
                    : "未知错误"
                  : stderr.trim()
              }`,
            ),
          );
          return;
        }
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const errors = Array.isArray(parsed["errors"]) ? parsed["errors"].filter(isIssue) : [];
          resolve({ ok: parsed["ok"] === true && errors.length === 0, errors });
        } catch {
          reject(new Error(`校验脚本输出无法解析: ${line}`));
        }
      },
    );
  });
};

/** 把校验问题渲染成给模型看的文本。 */
export const formatIssues = (errors: readonly CheckIssue[]): string => {
  return errors.map((issue) => `${issue.path}: [${issue.rule}] ${issue.message}`).join("\n");
};
