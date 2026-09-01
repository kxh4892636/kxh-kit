import { channel } from "node:diagnostics_channel";
import { createInterface, type Interface } from "node:readline/promises";
import { builtinModules } from "./builtins/discover";
import { runCli } from "./cli/run";
import type { BuiltinModuleFactory } from "./cli/types";

type MainInput = NodeJS.ReadableStream & {
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array | string>;
};

export interface MainRuntime {
  argv: readonly string[];
  cwd: () => string;
  env: Readonly<Record<string, string | undefined>>;
  input: MainInput;
  modules?: readonly BuiltinModuleFactory[];
  onSigint: (listener: () => void) => void;
  offSigint: (listener: () => void) => void;
  openLineReader: (input: MainInput) => Pick<Interface, "close" | "question">;
  stderr: { write: (chunk: string) => void };
  stdout: { write: (chunk: string) => void };
}

const inputDiagnostics = channel("nf.input");

export const isClosedInput = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error.code === "ERR_USE_AFTER_CLOSE" || error.code === "ABORT_ERR");

export const runMain = async (runtime: MainRuntime): Promise<number> => {
  let lineReader: Pick<Interface, "close" | "question"> | undefined;
  const controller = new AbortController();
  const readLine = async (): Promise<null | string> => {
    lineReader ??= runtime.openLineReader(runtime.input);
    try {
      return await lineReader.question("");
    } catch (error: unknown) {
      if (controller.signal.aborted || isClosedInput(error)) return null;
      inputDiagnostics.publish({
        level: "error",
        message: `Unable to read review input: ${error instanceof Error ? error.message : String(error)}`,
      });
      throw error;
    }
  };
  const readAll = async (): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of runtime.input) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  };
  const onSigint = (): void => {
    controller.abort();
    lineReader?.close();
  };

  runtime.onSigint(onSigint);
  try {
    return await runCli(
      {
        argv: runtime.argv,
        cwd: runtime.cwd(),
        env: runtime.env,
        signal: controller.signal,
        stdin: { readAll, readLine },
        stdout: { write: (chunk: string): void => runtime.stdout.write(chunk) },
        stderr: { write: (chunk: string): void => runtime.stderr.write(chunk) },
      },
      runtime.modules ?? builtinModules,
    );
  } finally {
    runtime.offSigint(onSigint);
    lineReader?.close();
  }
};

export const nodeRuntime = (): MainRuntime => ({
  argv: process.argv.slice(2),
  cwd: (): string => process.cwd(),
  env: process.env,
  input: process.stdin,
  onSigint: (listener: () => void): void => {
    process.on("SIGINT", listener);
  },
  offSigint: (listener: () => void): void => {
    process.off("SIGINT", listener);
  },
  openLineReader: (input: MainInput): Interface => createInterface({ input }),
  stdout: process.stdout,
  stderr: process.stderr,
});
