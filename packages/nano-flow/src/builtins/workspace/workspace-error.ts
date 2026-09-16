import type { JsonValue } from "../../cli/types";

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const errorDetail = (error: unknown): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "stderr" in error &&
    typeof error.stderr === "string"
  ) {
    const stderr = error.stderr.trim();
    if (stderr !== "") return stderr;
  }
  return errorMessage(error);
};

export const hasErrorCode = (error: unknown, ...codes: readonly unknown[]): boolean =>
  typeof error === "object" && error !== null && "code" in error && codes.includes(error.code);

/**
 * workspace 命令的配置/状态错误。
 * 定义在错误模块里是为了让 workspace-path 等底层模块也能抛出它而不反向依赖 workspace-config。
 */
export class WorkspaceConfigError extends Error {
  readonly hint: string | undefined;
  readonly details: Readonly<Record<string, JsonValue>> | undefined;

  constructor(
    message: string,
    options: { readonly details?: Readonly<Record<string, JsonValue>>; readonly hint?: string },
  ) {
    super(message);
    this.name = "WorkspaceConfigError";
    this.hint = options.hint;
    this.details = options.details;
  }
}
