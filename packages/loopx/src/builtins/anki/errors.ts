import type { JsonValue } from "../../cli/types";

export class AnkiOperationError extends Error {
  readonly action: string;
  readonly hint: string | undefined;
  readonly details: Readonly<Record<string, JsonValue>> | undefined;

  constructor(
    message: string,
    action: string,
    options: {
      readonly details?: Readonly<Record<string, JsonValue>>;
      readonly hint?: string;
    } = {},
  ) {
    super(message);
    this.name = "AnkiOperationError";
    this.action = action;
    this.hint = options.hint;
    this.details = options.details;
  }
}

export class ReadOnlyModeError extends AnkiOperationError {
  constructor(action: string) {
    super(
      `Action "${action}" is blocked: Anki is running in read-only mode. Remove --read-only to enable writes.`,
      action,
    );
    this.name = "ReadOnlyModeError";
  }
}
