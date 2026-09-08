#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { errorText, launchSchema, portSchema } from "./contract.js";
import { start, query, listPorts, logs, runSupervisor } from "./commands.js";
import { pathsFor } from "./paths.js";
// 省略 --port 时作用于该端口，与 DSH Web 界面默认端口一致。
export const DEFAULT_PORT = 3080;
const HELP = `dsh-alive (Windows, Node.js >=24.19.0)
  start [--port N]  Start in background; repeat to restart (default ${DEFAULT_PORT})
  stop [--port N]   Stop the managed instance (default ${DEFAULT_PORT})
  status [--port N] Show instance status; without --port lists all managed ports
  logs [--port N]   Print current log (default ${DEFAULT_PORT})
`;
export const resolvePort = (args: string[]): number => {
  if (!args.length) return DEFAULT_PORT;
  const [flag, value] = args;
  if (args.length > 2 || flag !== "--port" || value === undefined || !/^\d+$/.test(value))
    throw new Error("Expected --port N");
  return portSchema.parse(Number(value));
};
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
  if (process.platform !== "win32") throw new Error("dsh-alive currently supports Windows only");
  if (args[0] === "--supervisor" && args.length === 2) {
    const port = portSchema.parse(Number(args[1]));
    await runSupervisor(port, pathsFor(port));
    return;
  }
  const [command, ...rest] = args;
  if (!["start", "stop", "status", "logs"].includes(command))
    throw new Error("Unknown command; use --help");
  if (command === "status" && !rest.length) {
    for (const port of await listPorts()) output(JSON.stringify(await query(port)) + "\n");
    return;
  }
  const port = resolvePort(rest);
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
    process.stderr.write("dsh-alive: " + errorText(error) + "\n");
    process.exitCode = 1;
  });
}
