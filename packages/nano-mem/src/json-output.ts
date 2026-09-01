import type { CliError } from "./cli-error.js";

export interface CliIo {
  stderr: (text: string) => void;
  stdout: (text: string) => void;
}

interface ErrorEnvelope {
  error: {
    code: string;
    details?: unknown;
    hint?: string;
    message: string;
  };
  ok: false;
}

interface SuccessEnvelope<T> {
  data: T;
  ok: true;
}

const serialize = (value: ErrorEnvelope | SuccessEnvelope<unknown>, pretty: boolean): string =>
  `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`;

export const writeSuccess = <T>(io: CliIo, data: T, pretty: boolean): void => {
  io.stdout(serialize({ data, ok: true }, pretty));
};

export const writeError = (io: CliIo, error: CliError, pretty: boolean): void => {
  const detail: ErrorEnvelope["error"] = {
    code: error.code,
    message: error.message,
  };
  if (error.hint) detail.hint = error.hint;
  if (error.details !== undefined) detail.details = error.details;
  io.stderr(serialize({ error: detail, ok: false }, pretty));
};
