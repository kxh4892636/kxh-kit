import { execFile } from "node:child_process";

/** 一条校验问题。 */
interface CheckIssue {
  readonly path: string;
  readonly rule: string;
  readonly message: string;
}

/** 一次校验的结果。 */
interface CheckResult {
  readonly ok: boolean;
  readonly errors: readonly CheckIssue[];
  readonly warnings: readonly CheckIssue[];
  readonly updated: readonly string[];
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
 * @param options - 脚本路径、工作区、域根、上限与可选过滤。
 * @returns 解析后的结果；脚本输出无法解析时抛错。
 */
export const runCheck = (options: {
  script: string;
  workspace: string;
  domainsPath: string;
  limits: unknown;
  domain?: string;
  plan?: string;
  strict?: boolean;
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
      ...(options.domain === undefined ? [] : ["--domain", options.domain]),
      ...(options.plan === undefined ? [] : ["--plan", options.plan]),
      ...(options.strict === false ? ["--no-strict"] : []),
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
          const warnings = Array.isArray(parsed["warnings"])
            ? parsed["warnings"].filter(isIssue)
            : [];
          const updated = Array.isArray(parsed["updated"])
            ? parsed["updated"].filter((item): item is string => typeof item === "string")
            : [];
          resolve({ ok: parsed["ok"] === true && errors.length === 0, errors, warnings, updated });
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
