// AnkiConnect 通信层错误, 与上游 anki-mcp-server 行为对齐。

export class AnkiConnectError extends Error {
  readonly action: string | undefined;
  readonly originalError: string | undefined;

  constructor(message: string, action?: string, originalError?: string) {
    super(message);
    this.name = "AnkiConnectError";
    this.action = action;
    this.originalError = originalError;
  }
}

export class ReadOnlyModeError extends Error {
  readonly action: string;

  constructor(action: string) {
    super(
      `Action "${action}" is blocked: server is running in read-only mode. ` +
        `Write operations are disabled. Remove the --read-only flag to enable writes.`,
    );
    this.name = "ReadOnlyModeError";
    this.action = action;
  }
}
