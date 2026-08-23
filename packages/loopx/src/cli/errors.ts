import { CommanderError } from "commander";

export class DefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefinitionError";
  }
}

export const toErrorJson = (error: unknown, debug: boolean): Record<string, false | string> => {
  const payload: Record<string, false | string> = {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
  if (debug && error instanceof Error && error.stack !== undefined) {
    payload["stack"] = error.stack;
  }
  return payload;
};

export const isUsageError = (error: unknown): boolean => error instanceof CommanderError;
