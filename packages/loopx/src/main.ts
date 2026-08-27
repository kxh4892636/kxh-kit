#!/usr/bin/env node
import { nodeRuntime, runMain } from "./main-runtime";

process.exitCode = await runMain(nodeRuntime());
