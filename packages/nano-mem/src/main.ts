#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from "node:url";
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

const invokedUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedUrl === import.meta.url) {
  const sourceDirectory = fileURLToPath(new URL("../skills/nano-mem/", import.meta.url));
  process.exitCode = await runCli({
    registrars: [
      registerMemoryCommands,
      createSelfCommandRegistrar({ manifest: nanoMemSkillManifest, sourceDirectory }),
    ],
  });
}
