#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runCli } from "./cli.js";

export { createProgram, runCli } from "./cli.js";
export type { CommandContext, CommandRegistrar, RunCliOptions } from "./cli.js";
export { CliError, CliErrorKind } from "./cli-error.js";
export type { CliIo } from "./json-output.js";
export { nodeRuntime } from "./runtime.js";
export type {
  Clock,
  DatabaseFactory,
  PathRuntime,
  ProcessExecutor,
  ProcessRequest,
  ProcessResult,
  RuntimeDependencies,
} from "./runtime.js";
export { resolveTextInput } from "./text-input.js";

const invokedUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedUrl === import.meta.url) process.exitCode = await runCli();
