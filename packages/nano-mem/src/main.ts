#!/usr/bin/env node
import { nodeEnv, runCli } from "./cli";

const result = await runCli(process.argv.slice(2), nodeEnv());
if (result.stdout !== "") process.stdout.write(result.stdout);
if (result.stderr !== "") process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
