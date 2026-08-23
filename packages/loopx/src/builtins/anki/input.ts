import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CliUsageError } from "../../cli/errors";
import type { InvocationContext } from "../../cli/types";
import type { Logger } from "./logger";
import type { AnkiDependencies } from "./runtime";

const readStdin = async (context: InvocationContext): Promise<string> => {
  if (context.stdin.readAll !== undefined) return context.stdin.readAll();
  const lines: string[] = [];
  for (;;) {
    const line = await context.stdin.readLine();
    if (line === null) return lines.join("\n");
    lines.push(line);
  }
};

export const readTextInput = async (
  source: string,
  context: InvocationContext,
  dependencies: AnkiDependencies,
  logger?: Logger,
): Promise<string> => {
  try {
    if (dependencies.readText !== undefined) return await dependencies.readText(source, context);
    if (source === "-") return await readStdin(context);
    return await readFile(resolve(context.cwd, source), "utf8");
  } catch (error: unknown) {
    logger?.warn(
      `Unable to read input "${source}": ${error instanceof Error ? error.message : String(error)}`,
    );
    throw new CliUsageError(`Unable to read input file: ${source}`);
  }
};
