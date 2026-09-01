export const CliErrorKind = {
  runtime: "runtime",
  usage: "usage",
} as const;

export type CliErrorKind = (typeof CliErrorKind)[keyof typeof CliErrorKind];

export class CliError extends Error {
  readonly code: string;
  readonly hint: string | undefined;
  readonly kind: CliErrorKind;

  constructor(code: string, message: string, kind: CliErrorKind, hint?: string) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.hint = hint;
    this.kind = kind;
  }
}

export const asCliError = (error: unknown): CliError => {
  if (error instanceof CliError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new CliError("RUNTIME_ERROR", message, CliErrorKind.runtime);
};
