#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { errorText, launchSchema, portSchema, tagSchema, type Status } from "./contract.js";
import { start, update, query, listPorts, logs, runSupervisor } from "./commands.js";
import { pathsFor } from "./paths.js";
import { DEFAULT_TAG, readRecordedState } from "./runtime/versions.js";
// 省略 --port 时作用于该端口，与 DSH Web 界面默认端口一致。
export const DEFAULT_PORT = 3080;
const COMMANDS = ["start", "update", "stop", "status", "logs"];
// 只有这两个命令接受 --tag：通道属于版本，停止、查询与日志与版本无关。
const TAG_COMMANDS = ["start", "update"];
const HELP = `dsh-alive (Windows, Node.js >=24.19.0)
  start [--port N] [--tag T]   Start in background; repeat to restart (default port ${DEFAULT_PORT}, tag ${DEFAULT_TAG})
  update [--port N] [--tag T]  Install the tag's current version without starting or restarting
  stop [--port N]              Stop the managed instance (default ${DEFAULT_PORT})
  status [--port N]            Show instance status; without --port lists all managed ports
  logs [--port N]              Print current log (default ${DEFAULT_PORT})
  --tag T follows an npm dist-tag such as latest, alpha or next; it is remembered per port
`;
export interface Options {
  port: number;
  tag: string | undefined;
}
export const parseOptions = (args: string[], allowTag: boolean = false): Options => {
  const usage = allowTag ? "Expected --port N or --tag T" : "Expected --port N";
  const options: Options = { port: DEFAULT_PORT, tag: undefined };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (value === undefined || seen.has(flag)) throw new Error(usage);
    seen.add(flag);
    if (flag === "--port") {
      if (!/^\d+$/.test(value)) throw new Error("Expected --port N");
      options.port = portSchema.parse(Number(value));
      continue;
    }
    if (flag === "--tag" && allowTag) {
      options.tag = tagSchema.parse(value);
      continue;
    }
    throw new Error(usage);
  }
  return options;
};
// 未显式指定 --tag 时沿用该端口上次使用的通道，使通道成为端口的属性。
export const resolveTag = async (port: number, requested: string | undefined): Promise<string> => {
  if (requested !== undefined) return requested;
  const recorded = await readRecordedState(pathsFor(port).state);
  return recorded?.tag ?? DEFAULT_TAG;
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
  if (!COMMANDS.includes(command)) throw new Error("Unknown command; use --help");
  if (command === "status" && !rest.length) {
    for (const port of await listPorts()) output(JSON.stringify(await query(port)) + "\n");
    return;
  }
  const options = parseOptions(rest, TAG_COMMANDS.includes(command));
  if (command === "logs") {
    output(await logs(options.port));
    return;
  }
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair: [string, unknown]): pair is [string, string] => pair[1] !== undefined,
    ),
  );
  const launch = launchSchema.parse({ cwd: process.cwd(), env });
  let status: Status;
  switch (command) {
    case "start":
      status = await start(options.port, launch, await resolveTag(options.port, options.tag));
      break;
    case "update":
      status = await update(options.port, launch, await resolveTag(options.port, options.tag));
      break;
    default:
      status = await query(options.port, command === "stop");
  }
  output(JSON.stringify(status) + "\n");
};
// nvm 的启动路径经过目录链接，须与模块的真实路径比较。
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error: unknown): void => {
    process.stderr.write("dsh-alive: " + errorText(error) + "\n");
    process.exitCode = 1;
  });
}
