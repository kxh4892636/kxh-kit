import { spawn } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  delay,
  portSchema,
  type Launch,
  type Request,
  type Reply,
  type Status,
} from "./contract.js";
import { pathsFor, preparePaths, readJson, saveJson, type Paths } from "./paths.js";
import {
  installTag,
  prepareVersion,
  preparedMessage,
  readRecordedState,
  runNpm,
  type Npm,
} from "./runtime/versions.js";
import { request, serve } from "./runtime/transport.js";
import { appendLog } from "./runtime/log.js";
import { createInstance, type InstanceIo } from "./runtime/instance.js";
const stoppedStatus = (
  port: number,
  paths: Paths,
  tag: string | null,
  prepared: string | null,
): Status => ({
  port,
  state: "stopped",
  pid: null,
  version: null,
  error: null,
  log: paths.log,
  tag,
  prepared,
});
export const runSupervisor = async (port: number, paths: Paths, io?: InstanceIo): Promise<void> => {
  await preparePaths(paths);
  // 从磁盘恢复通道与待生效版本，让新建 supervisor 的 status 与无 supervisor 时一致。
  const instance = createInstance(port, paths, io, await readRecordedState(paths.state));
  const token = randomBytes(32).toString("hex");
  let closing = false;
  const server = await serve(
    paths.pipe,
    async (message: Request): Promise<Reply> => {
      if (closing) return { ok: false, error: "Supervisor is stopping; retry start" };
      if (message.command === "status") return { ok: true, status: instance.status() };
      if (message.command === "stop") closing = true;
      try {
        let status: Status;
        if (message.command === "start") status = await instance.start(message.launch, message.tag);
        else if (message.command === "update")
          status = await instance.update(message.launch, message.tag);
        else status = await instance.stop();
        if (message.command === "stop") server.close();
        return { ok: true, status };
      } catch (error) {
        if (message.command === "stop") closing = false;
        throw error;
      }
    },
    token,
  );
  try {
    await saveJson(join(paths.directory, "control.json"), { token });
  } catch (error) {
    server.close();
    throw error;
  }
};
const send = async (paths: Paths, message: Request): Promise<Reply> => {
  const auth = z
    .object({ token: z.string().length(64) })
    .parse(await readJson(join(paths.directory, "control.json")));
  return request(paths.pipe, message, 720000, auth.token);
};
const unreachable = (error: unknown): boolean =>
  ["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "");
type SupervisorKind = "none" | "legacy" | "current";
// 旧版 supervisor 的状态回复没有 tag 字段，无法表达发布通道；升级后必须由新版接管。
const supervisorKind = async (paths: Paths): Promise<SupervisorKind> => {
  try {
    const reply = await send(paths, { command: "status" });
    // 有应答但状态不可用时（例如正在停止）按新版处理，把结果交给调用方报错。
    if (!reply.ok) return "current";
    return reply.status.tag === undefined ? "legacy" : "current";
  } catch (error) {
    if (!unreachable(error)) throw error;
    return "none";
  }
};
// 旧版 supervisor 收到 stop 后才异步关闭控制通道；必须等它真的不再应答，
// 否则新的 start 可能被旧版接管，或新版 listen 撞上尚未释放的命名管道。
const retireLegacy = async (paths: Paths): Promise<void> => {
  await send(paths, { command: "stop" }).catch((): void => {});
  for (let i = 0; i < 100; i++) {
    try {
      await send(paths, { command: "status" });
    } catch (error) {
      if (!unreachable(error)) throw error;
      // 清掉旧 token：新 supervisor 就绪前用旧凭据连接会被拒绝。
      await rm(join(paths.directory, "control.json"), { force: true });
      return;
    }
    await delay(50);
  }
  throw new Error("Legacy supervisor did not stop; retry start");
};
export const spawnSupervisor = (port: number): void => {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("./main.mjs", import.meta.url)), "--supervisor", String(port)],
    { detached: true, windowsHide: true, stdio: "ignore" },
  );
  child.on("error", (error: Error): void => {
    process.stderr.write(error.message + "\n");
  });
  child.unref();
};
export const start = async (
  port: number,
  launch: Launch,
  tag: string,
  paths: Paths = pathsFor(port),
  spawnBackground: () => void = (): void => spawnSupervisor(port),
): Promise<Status> => {
  const message: Request = { command: "start", launch, tag };
  const kind = await supervisorKind(paths);
  if (kind === "legacy") await retireLegacy(paths);
  if (kind === "current") {
    try {
      const reply = await send(paths, message);
      if (!reply.ok) throw new Error(reply.error);
      // 缺少 tag 说明应答来自旧版：宁可报错，也不要静默按旧语义启动。
      if (reply.status.tag === undefined)
        throw new Error("Supervisor did not upgrade; retry start");
      return reply.status;
    } catch (error) {
      // supervisor 在探活之后退出：落回拉起路径，而不是把 IPC 错误抛给用户。
      if (!unreachable(error)) throw error;
    }
  }
  await preparePaths(paths);
  spawnBackground();
  for (let i = 0; i < 100; i++) {
    await delay(100);
    try {
      const reply = await send(paths, message);
      if (!reply.ok) throw new Error(reply.error);
      if (reply.status.tag === undefined)
        throw new Error("Supervisor did not upgrade; retry start");
      return reply.status;
    } catch (error) {
      if (!unreachable(error)) throw error;
    }
  }
  throw new Error("Supervisor did not start; check Node.js and permissions");
};
// update 只更新版本：已有 supervisor 时交给它串行处理，否则在 CLI 进程内直接安装，
// 不拉起控制进程，也不启动 DSH 实例。旧版 supervisor 无法在不停止实例的前提下接管，
// 因此要求先执行 start。
export const update = async (
  port: number,
  launch: Launch,
  tag: string,
  paths: Paths = pathsFor(port),
  npm: Npm = runNpm,
): Promise<Status> => {
  const kind = await supervisorKind(paths);
  if (kind === "legacy")
    throw new Error("Supervisor predates tag support; run dsh-alive start, then retry update");
  if (kind === "current") {
    const reply = await send(paths, { command: "update", launch, tag });
    if (!reply.ok) throw new Error(reply.error);
    return reply.status;
  }
  await preparePaths(paths);
  const prepared = await prepareVersion(paths, launch, tag, (directory, input, name) =>
    installTag(directory, input, name, npm),
  );
  try {
    appendLog(paths.log, new Date().toISOString() + " " + preparedMessage(prepared) + "\n");
  } catch {
    // 日志不可写不应让已完成的更新以异常退出。
  }
  return stoppedStatus(port, paths, tag, prepared.version.version);
};
export const query = async (
  port: number,
  stop: boolean = false,
  paths: Paths = pathsFor(port),
): Promise<Status> => {
  try {
    const reply = await send(paths, { command: stop ? "stop" : "status" });
    if (!reply.ok) throw new Error(reply.error);
    return reply.status;
  } catch (error) {
    if (!unreachable(error)) throw error;
    // 没有 supervisor 时只能报告磁盘上的记录：当前通道与下次 start 将启动的版本。
    const recorded = await readRecordedState(paths.state);
    return stoppedStatus(port, paths, recorded?.tag ?? null, recorded?.version ?? null);
  }
};
export const listPorts = async (paths: Paths = pathsFor(1)): Promise<number[]> => {
  try {
    return (await readdir(paths.root))
      .filter((name: string): boolean => /^\d+$/.test(name))
      .map(Number)
      .filter((port: number): boolean => portSchema.safeParse(port).success)
      .sort((a: number, b: number): number => a - b);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};
export const logs = async (port: number, paths: Paths = pathsFor(port)): Promise<string> => {
  try {
    return await readFile(paths.log, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "No log yet\n";
    throw error;
  }
};
