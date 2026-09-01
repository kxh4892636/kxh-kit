import { describe, expect, test } from "vitest";
import { asCliError, CliError, CliErrorKind } from "./cli-error.js";

describe("CLI error normalization", (): void => {
  test("preserves an existing CLI error", (): void => {
    const expected = new CliError("KNOWN", "known", CliErrorKind.usage);
    expect(asCliError(expected)).toBe(expected);
  });

  test("normalizes Error instances", (): void => {
    expect(asCliError(new Error("failure"))).toMatchObject({
      code: "RUNTIME_ERROR",
      kind: "runtime",
      message: "failure",
    });
  });

  test("normalizes non-Error values", (): void => {
    expect(asCliError("failure")).toMatchObject({ message: "failure" });
  });
});
