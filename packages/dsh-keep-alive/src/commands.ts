import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { delay, portSchema, type Launch, type Request, type Status } from "./contract.js";
import { pathsFor, preparePaths, readJson, saveJson, type Paths } from "./paths.js";
import { request, serve } from "./runtime/transport.js";
import { createInstance, type InstanceIo } from "./runtime/instance.js";
export const runSupervisor = async (port: number, paths: Paths, io?: InstanceIo): Promise<void> => {
  await preparePaths(paths);
  const instance = createInstance(port, paths, io);
  const token = randomBytes(32).toString("hex");
  let closing = false;
  const server = await serve(
    paths.pipe,
    async (message: Request): Promise<import("./contract.js").Reply> => {
      if (closing) return { ok: false, error: "Supervisor is stopping; retry start" };
      if (message.command === "status") return { ok: true, status: instance.status() };
      if (message.command === "stop") closing = true;
      try {
        const status =
          message.command === "start"
            ? await instance.start(message.launch)
            : await instance.stop();
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
const send = async (paths: Paths, message: Request): Promise<import("./contract.js").Reply> => {
  const auth = z
    .object({ token: z.string().length(64) })
    .parse(await readJson(join(paths.directory, "control.json")));
  return request(paths.pipe, message, 720000, auth.token);
};
export const spawnSupervisor = (port: number): void => {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("./main.js", import.meta.url)), "--supervisor", String(port)],
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
  paths: Paths = pathsFor(port),
  spawnBackground: () => void = (): void => spawnSupervisor(port),
): Promise<Status> => {
  const message: Request = { command: "start", launch };
  try {
    const reply = await send(paths, message);
    if (!reply.ok) throw new Error(reply.error);
    return reply.status;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ECONNREFUSED") throw error;
  }
  await preparePaths(paths);
  spawnBackground();
  for (let i = 0; i < 100; i++) {
    await delay(100);
    try {
      const reply = await send(paths, message);
      if (!reply.ok) throw new Error(reply.error);
      return reply.status;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ECONNREFUSED") throw error;
    }
  }
  throw new Error("Supervisor did not start; check Node.js and permissions");
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
    if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? ""))
      throw error;
    return { port, state: "stopped", pid: null, version: null, error: null, log: paths.log };
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
