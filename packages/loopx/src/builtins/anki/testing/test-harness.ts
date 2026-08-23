import { runCli, type CliRequest } from "../../../cli/run";
import type { BuiltinCommand, JsonValue } from "../../../cli/types";
import { createAnkiCommand } from "../anki-command";
import type { AnkiConfig } from "../config";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import type { AnkiDependencies } from "../runtime";

export interface Invocation {
  readonly action: string;
  readonly params: Readonly<Record<string, JsonValue>> | undefined;
}

export type InvokeHandler = (
  action: string,
  params: Readonly<Record<string, JsonValue>> | undefined,
  invocation: number,
) => unknown;

export const scriptedPort = (handler: InvokeHandler, invocations: Invocation[]): AnkiPort => ({
  invoke: async <Result>(
    action: string,
    params?: Readonly<Record<string, JsonValue>>,
  ): Promise<Result> => {
    invocations.push({ action, params });
    const response = await handler(action, params, invocations.length - 1);
    if (response instanceof Error) throw response;
    return response as Result;
  },
});

export const invokeAnki = async (
  argv: readonly string[],
  handler: InvokeHandler = (): undefined => undefined,
  options: {
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly readText?: AnkiDependencies["readText"];
  } = {},
): Promise<{
  readonly code: number;
  readonly invocations: readonly Invocation[];
  readonly stderr: string;
  readonly stdout: string;
}> => {
  let stdout = "";
  let stderr = "";
  const invocations: Invocation[] = [];
  const dependencies: AnkiDependencies = {
    connect: (_config: AnkiConfig, _logger: Logger): AnkiPort => scriptedPort(handler, invocations),
    ...(options.readText === undefined ? {} : { readText: options.readText }),
  };
  const request: CliRequest = {
    argv: ["anki", ...argv, "--compact"],
    cwd: process.cwd(),
    env: options.env ?? {},
    signal: new AbortController().signal,
    stdin: { readLine: async (): Promise<null> => null },
    stdout: { write: (chunk: string): void => void (stdout += chunk) },
    stderr: { write: (chunk: string): void => void (stderr += chunk) },
  };
  const code = await runCli(request, [(): BuiltinCommand => createAnkiCommand(dependencies)]);
  return { code, invocations, stdout, stderr };
};
