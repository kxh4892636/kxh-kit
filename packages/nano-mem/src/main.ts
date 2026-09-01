#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runCli } from "./cli.js";
import { registerMemoryCommands } from "./memory/memory-commands.js";
import { nanoMemSkillManifest } from "./self/generated-skill-manifest.js";
import { createSelfCommandRegistrar } from "./self/self-commands.js";

export { createProgram, runCli } from "./cli.js";
export type { CliInput, CommandContext, CommandRegistrar, RunCliOptions } from "./cli.js";
export { CliError, CliErrorKind } from "./cli-error.js";
export type { CliIo } from "./json-output.js";
export { nodeRuntime, ProcessExecutionError } from "./runtime.js";
export type {
  Clock,
  DatabaseFactory,
  PathRuntime,
  ProcessExecutor,
  ProcessRequest,
  ProcessResult,
  RuntimeDependencies,
} from "./runtime.js";
export { resolveOptionalTextInput, resolveTextInput } from "./text-input.js";

type CanonicalPath = (path: string) => string;

export const isDirectInvocation = (
  invokedPath: string | undefined,
  moduleUrl: string,
  canonicalPath: CanonicalPath = realpathSync,
): boolean => {
  if (invokedPath === undefined) return false;
  try {
    return canonicalPath(invokedPath) === canonicalPath(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
};

if (isDirectInvocation(process.argv[1], import.meta.url)) {
  const sourceDirectory = fileURLToPath(new URL("../skills/nano-mem/", import.meta.url));
  process.exitCode = await runCli({
    registrars: [
      registerMemoryCommands,
      createSelfCommandRegistrar({ manifest: nanoMemSkillManifest, sourceDirectory }),
    ],
  });
}
