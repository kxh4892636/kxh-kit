#!/usr/bin/env node
import { runCli } from "./cli/run";

await runCli(process.argv.slice(2));
