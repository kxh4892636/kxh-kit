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
