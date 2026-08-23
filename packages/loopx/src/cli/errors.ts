import { CommanderError } from "commander";
import type { JsonValue } from "./types";

export class DefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefinitionError";
  }
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

interface StructuredError extends Error {
  readonly action?: string;
  readonly details?: Readonly<Record<string, JsonValue>>;
  readonly hint?: string;
}

const isStructuredError = (error: Error): error is StructuredError =>
  "action" in error || "hint" in error || "details" in error;

export const toErrorJson = (error: unknown, debug: boolean): Record<string, JsonValue> => {
  const payload: Record<string, JsonValue> = {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
  if (error instanceof Error && isStructuredError(error)) {
    if (error.action !== undefined) payload["action"] = error.action;
    if (error.hint !== undefined) payload["hint"] = error.hint;
    if (error.details !== undefined) Object.assign(payload, error.details);
  }
  if (debug && error instanceof Error && error.stack !== undefined) {
    payload["stack"] = error.stack;
  }
  return payload;
};

export const isUsageError = (error: unknown): boolean =>
  error instanceof CommanderError || error instanceof CliUsageError;
