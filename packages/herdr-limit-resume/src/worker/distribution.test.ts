import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";
import { closeFakeHerdrServers, listen, type SocketRequest } from "../fake-herdr.test-support.js";

const execFileAsync = promisify(execFile);
const stateDirs: string[] = [];

afterEach(async (): Promise<void> => {
  await closeFakeHerdrServers();
  await Promise.all(
    stateDirs.splice(0).map(async (stateDir: string): Promise<void> => {
      await rm(stateDir, { force: true, recursive: true });
    }),
  );
});

test("built distribution starts all three plugin entrypoints", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-dist-"));
  stateDirs.push(stateDir);
  const responder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "plugin.list") return { plugins: [], type: "plugin_list" };
    if (request.method === "agent.list") return { agents: [], type: "agent_list" };
    throw new Error(`Unexpected distribution method: ${request.method}`);
  };
  const { socketPath } = await listen(responder);
  const artifactDir = join(stateDir, "clean-artifact");
  const artifactDist = join(artifactDir, "dist");
  await mkdir(artifactDist, { recursive: true });
  await Promise.all([
    copyFile(
      fileURLToPath(new URL("../../dist/main.mjs", import.meta.url)),
      join(artifactDist, "main.mjs"),
    ),
    copyFile(
      fileURLToPath(new URL("../../herdr-plugin.toml", import.meta.url)),
      join(artifactDir, "herdr-plugin.toml"),
    ),
    copyFile(
      fileURLToPath(new URL("../../package.json", import.meta.url)),
      join(artifactDir, "package.json"),
    ),
    copyFile(
      fileURLToPath(new URL("../../README.md", import.meta.url)),
      join(artifactDir, "README.md"),
    ),
  ]);
  const mainPath = join(artifactDist, "main.mjs");
  const environment = {
    ...process.env,
    HERDR_PLUGIN_EVENT_JSON: "{}",
    HERDR_PLUGIN_STATE_DIR: stateDir,
    HERDR_SOCKET_PATH: socketPath,
  };

  const scan = await execFileAsync(process.execPath, [mainPath, "scan-now"], { env: environment });
  const event = await execFileAsync(process.execPath, [mainPath, "handle-event"], {
    env: environment,
  });
  const worker = await execFileAsync(process.execPath, [mainPath, "worker"], { env: environment });

  expect(JSON.parse(scan.stdout)).toEqual({ failed: 0, resumed: 0, scanned: 0, skipped: 0 });
  expect(JSON.parse(event.stdout).skipped).toBe(1);
  expect(JSON.parse(worker.stdout)).toEqual({ reason: "disabled_or_missing", rounds: 0 });
});
