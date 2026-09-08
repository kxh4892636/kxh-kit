#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { errorText, launchSchema, portSchema } from "./contract.js";
import { start, query, listPorts, logs, runSupervisor } from "./commands.js";
import { pathsFor } from "./paths.js";
const HELP = `dsh-keep-alive (Windows, Node.js >=24.19.0)
  start --port N    Start in background; repeat to restart
  stop --port N     Stop the managed instance
  status [--port N] Show instance status
  logs --port N    Print current log
`;
export const main = async (
  args: string[],
  output: (text: string) => void = (text: string): void => {
    process.stdout.write(text);
  },
): Promise<void> => {
  if (!args.length || args[0] === "--help" || args[0] === "-h") {
    output(HELP);
    return;
  }
  if (process.platform !== "win32")
    throw new Error("dsh-keep-alive currently supports Windows only");
  if (args[0] === "--supervisor" && args.length === 2) {
    const port = portSchema.parse(Number(args[1]));
    await runSupervisor(port, pathsFor(port));
    return;
  }
  const [command, flag, value] = args;
  if (!["start", "stop", "status", "logs"].includes(command))
    throw new Error("Unknown command; use --help");
  if (command === "status" && args.length === 1) {
    for (const port of await listPorts()) output(JSON.stringify(await query(port)) + "\n");
    return;
  }
  if (args.length !== 3 || flag !== "--port" || !/^\d+$/.test(value))
    throw new Error("Expected --port N");
  const port = portSchema.parse(Number(value));
  if (command === "logs") {
    output(await logs(port));
    return;
  }
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair: [string, unknown]): pair is [string, string] => pair[1] !== undefined,
    ),
  );
  const status =
    command === "start"
      ? await start(port, launchSchema.parse({ cwd: process.cwd(), env }))
      : await query(port, command === "stop");
  output(JSON.stringify(status) + "\n");
};
// nvm 的启动路径经过目录链接，须与模块的真实路径比较。
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error: unknown): void => {
    process.stderr.write("dsh-keep-alive: " + errorText(error) + "\n");
    process.exitCode = 1;
  });
}
