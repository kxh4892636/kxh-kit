import { spawn, execFile } from "node:child_process";
import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const directory = path.dirname(fileURLToPath(import.meta.url));
const runId = process.env.ETF_E2E_RUN_ID;
if (!runId || !/^[a-f0-9-]{36}$/.test(runId)) throw new Error("缺少有效的测试运行标识");
const runtimeRoot = path.resolve(directory, "../.backend");
const runtime = path.join(runtimeRoot, runId);
const runArgument = "--etf-e2e-run=" + runId;
const statePath = path.join(runtime, "state.json");
export const BACKEND_URL = "http://127.0.0.1:" + (process.env.ETF_E2E_BACKEND_PORT ?? "18181");
export interface BackendState {
  mode: "managed";
  pid?: number;
  entryPath: string;
}
export const readBackendState = (): BackendState | null =>
  existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8")) as BackendState) : null;
export const writeBackendState = (state: BackendState): void => {
  mkdirSync(runtime, { recursive: true });
  writeFileSync(statePath, JSON.stringify(state));
};
export const isBackendHealthy = async (): Promise<boolean> => {
  try {
    return (
      (await (await fetch(BACKEND_URL, { signal: AbortSignal.timeout(1000) })).json()).ok === true
    );
  } catch {
    return false;
  }
};
export const waitForBackendHealthy = async (timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isBackendHealthy()) return;
    await new Promise((resolve): void => {
      setTimeout(resolve, 100);
    });
  }
  throw new Error("ETF 测试后端未就绪");
};
export const prepareBackend = async (): Promise<string> => {
  const service = path.resolve(directory, "../../../etf-service");
  await promisify(execFile)(
    process.execPath,
    [path.resolve(service, "node_modules/@typescript/native/bin/tsc"), "-p", "tsconfig.json"],
    { cwd: service, timeout: 60000 },
  );
  return path.join(directory, "fixture-server.mjs");
};
export const spawnBackend = (entry: string): number => {
  mkdirSync(runtime, { recursive: true });
  const log = openSync(path.join(runtime, "backend.log"), "a");
  const child = spawn(process.execPath, [entry, runArgument], {
    cwd: path.resolve(directory, "../.."),
    env: { ...process.env, DATABASE_DSN: path.join(runtime, "test.sqlite") },
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  child.unref();
  if (child.pid === undefined) throw new Error("测试服务没有启动");
  return child.pid;
};
export const killBackend = async (pid: number): Promise<void> => {
  const state = readBackendState();
  if (state?.pid !== pid || !Number.isSafeInteger(pid) || pid <= 0)
    throw new Error("不是本次测试管理的服务");
  try {
    // 状态按运行隔离；停止前再核对进程命令行，防止陈旧 PID 已被系统复用。
    const { stdout } =
      process.platform === "win32"
        ? await promisify(execFile)(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`,
            ],
            { windowsHide: true },
          )
        : await promisify(execFile)("ps", ["-p", String(pid), "-o", "args="]);
    if (!stdout.includes(runArgument) || !stdout.includes(state.entryPath))
      throw new Error("进程身份与本次测试不符，拒绝停止");
    if (process.platform === "win32")
      await promisify(execFile)("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
      });
    else process.kill(pid, "SIGTERM");
  } catch (error) {
    try {
      process.kill(pid, 0);
    } catch {
      delete state.pid;
      writeBackendState(state);
      return;
    }
    throw error;
  }
  delete state.pid;
  writeBackendState(state);
};
export const cleanupBackendRuntime = (): void => {
  if (path.dirname(runtime) !== runtimeRoot) throw new Error("非法清理路径");
  rmSync(runtime, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
};
