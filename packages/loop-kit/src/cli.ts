#!/usr/bin/env node

import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installSnapshot } from "./install.ts";

const targetFlagIndex = process.argv.indexOf("--target");
const target = targetFlagIndex === -1 ? undefined : process.argv[targetFlagIndex + 1];

if (target === undefined || target.startsWith("--")) {
  console.error("Missing required option: --target <path>");
  process.exitCode = 1;
} else {
  const targetRoot = resolve(target);
  let targetIsDirectory = false;

  try {
    targetIsDirectory = statSync(targetRoot).isDirectory();
  } catch (error: unknown) {
    console.error(`Target must be an existing directory: ${targetRoot}`, error);
    process.exitCode = 1;
  }

  if (!targetIsDirectory && process.exitCode !== 1) {
    console.error(`Target must be an existing directory: ${targetRoot}`);
    process.exitCode = 1;
  }

  if (targetIsDirectory) {
    try {
      const payloadRoot = join(dirname(fileURLToPath(import.meta.url)), "payload");
      const summary = installSnapshot(payloadRoot, targetRoot);
      console.log(
        `Installed to ${targetRoot}: created ${summary.created}, updated ${summary.updated}, unchanged ${summary.unchanged}, deleted ${summary.deleted}`,
      );
    } catch (error: unknown) {
      console.error(`Installation failed for ${targetRoot}`, error);
      process.exitCode = 1;
    }
  }
}
