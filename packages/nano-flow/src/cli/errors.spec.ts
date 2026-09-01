import { CommanderError } from "commander";
import { describe, expect, test } from "vitest";
import { CliUsageError, DefinitionError, isUsageError, toErrorJson } from "./errors";

describe("CLI error contracts", (): void => {
  test("constructs named definition and usage errors", (): void => {
    const definition = new DefinitionError("bad definition");
    expect({ message: definition.message, name: definition.name }).toEqual({
      message: "bad definition",
      name: "DefinitionError",
    });
    const usage = new CliUsageError("bad usage");
    expect({ message: usage.message, name: usage.name }).toEqual({
      message: "bad usage",
      name: "CliUsageError",
    });
  });

  test.each([
    ["failure", { success: false, error: "failure" }],
    [null, { success: false, error: "null" }],
    [new Error("broken"), { success: false, error: "broken" }],
  ])("normalizes an unstructured error %#", (error: unknown, expected): void => {
    expect(toErrorJson(error, false)).toEqual(expected);
  });

  test("copies every defined structured error field", (): void => {
    const error = Object.assign(new Error("failed"), {
      action: "clone",
      hint: "retry",
      details: { name: "wiki", count: 2 },
    });
    expect(toErrorJson(error, false)).toEqual({
      success: false,
      error: "failed",
      action: "clone",
      hint: "retry",
      name: "wiki",
      count: 2,
    });
  });

  test.each([
    [{ action: "clone" }, { action: "clone" }],
    [{ hint: "retry" }, { hint: "retry" }],
    [{ details: { name: "wiki" } }, { name: "wiki" }],
    [{ action: undefined, hint: undefined, details: undefined }, {}],
  ])("handles sparse structured fields %#", (fields, expected): void => {
    const error = Object.assign(new Error("failed"), fields);
    expect(toErrorJson(error, false)).toStrictEqual({
      success: false,
      error: "failed",
      ...expected,
    });
  });

  test("includes a stack only in debug mode when one exists", (): void => {
    const error = new Error("failed");
    expect(toErrorJson(error, false)).toStrictEqual({ success: false, error: "failed" });
    expect(toErrorJson(error, true)).toStrictEqual({
      success: false,
      error: "failed",
      stack: error.stack,
    });
    delete error.stack;
    expect(toErrorJson(error, true)).toStrictEqual({ success: false, error: "failed" });
  });

  test("classifies only Commander and CLI usage errors as usage failures", (): void => {
    expect(isUsageError(new CommanderError(1, "bad", "commander"))).toBe(true);
    expect(isUsageError(new CliUsageError("usage"))).toBe(true);
    expect(isUsageError(new DefinitionError("definition"))).toBe(false);
    expect(isUsageError(new Error("general"))).toBe(false);
    expect(isUsageError("usage")).toBe(false);
    expect(isUsageError(null)).toBe(false);
  });
});
