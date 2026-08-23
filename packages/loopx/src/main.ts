#!/usr/bin/env node
import { builtinModules } from "./builtins/discover";
import { runCli } from "./cli/run";

const readLine = async (): Promise<null | string> => {
  for await (const chunk of process.stdin) return String(chunk).replace(/\r?\n$/u, "");
  return null;
};

const readAll = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
};

process.exitCode = await runCli(
  {
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
    signal: new AbortController().signal,
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
