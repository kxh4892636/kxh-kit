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

export const toErrorJson = (error: unknown, debug: boolean): Record<string, JsonValue> => {
  const payload: Record<string, JsonValue> = {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
  if (error instanceof Error) {
    const structured = error as StructuredError;
    if (structured.action !== undefined) payload["action"] = structured.action;
    if (structured.hint !== undefined) payload["hint"] = structured.hint;
    if (structured.details !== undefined) Object.assign(payload, structured.details);
  }
  if (debug && error instanceof Error && error.stack !== undefined) {
    payload["stack"] = error.stack;
  }
  return payload;
};

export const isUsageError = (error: unknown): boolean =>
  error instanceof CommanderError || error instanceof CliUsageError;
