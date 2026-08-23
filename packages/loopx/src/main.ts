#!/usr/bin/env node
import { channel } from "node:diagnostics_channel";
import { createInterface, type Interface } from "node:readline/promises";
import { builtinModules } from "./builtins/discover";
import { runCli } from "./cli/run";

let lineReader: Interface | undefined;
const inputDiagnostics = channel("loopx.input");
const isClosedInput = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error.code === "ERR_USE_AFTER_CLOSE" || error.code === "ABORT_ERR");
const readLine = async (): Promise<null | string> => {
  lineReader ??= createInterface({ input: process.stdin });
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
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
};

const controller = new AbortController();
const onSigint = (): void => {
  controller.abort();
  lineReader?.close();
};
process.on("SIGINT", onSigint);
try {
  process.exitCode = await runCli(
    {
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      env: process.env,
      signal: controller.signal,
      stdin: { readAll, readLine },
      stdout: {
        write: (chunk: string): void => {
          process.stdout.write(chunk);
        },
      },
      stderr: {
        write: (chunk: string): void => {
          process.stderr.write(chunk);
        },
      },
    },
    builtinModules,
  );
} finally {
  process.off("SIGINT", onSigint);
  lineReader?.close();
}
