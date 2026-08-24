import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  closeFakeHerdrServers,
  fakeAgent,
  listen,
  responseFor,
  type SocketRequest,
} from "../fake-herdr.test-support.js";
import { WorkerLease } from "./worker-lease.js";
import { runWorker, type WorkerScanTrigger } from "./worker.js";

const stateDirs: string[] = [];

afterEach(async (): Promise<void> => {
  await closeFakeHerdrServers();
  await Promise.all(
    stateDirs.splice(0).map(async (stateDir: string): Promise<void> => {
      await rm(stateDir, { force: true, recursive: true });
    }),
  );
});

test("real socket lifecycle check precedes the startup and interval scans", async (): Promise<void> => {
  const stateDir = await createStateDir();
  let waitCount = 0;
  const responder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "plugin.list") {
      return {
        plugins: [{ enabled: true, plugin_id: "kxh.limit-resume" }],
        type: "plugin_list",
      };
    }
    return responseFor(fakeAgent)(request);
  };
  const { requests, socketPath } = await listen(responder);

  const result = await runWorker({
    now: (): number => waitCount * 30_000,
    socketPath,
    stateDir,
    wait: async (): Promise<"stop" | "tick"> => {
      waitCount += 1;
      return waitCount === 1 ? "tick" : "stop";
    },
  });

  expect(result).toEqual({ reason: "stopped", rounds: 2 });
  expect(requests[0]?.method).toBe("plugin.list");
  expect(
    requests.filter((request: SocketRequest): boolean => request.method === "plugin.list"),
  ).toHaveLength(2);
  expect(
    requests.filter((request: SocketRequest): boolean => request.method === "agent.prompt"),
  ).toHaveLength(1);
});

const createStateDir = async (): Promise<string> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-worker-"));
  stateDirs.push(stateDir);
  return stateDir;
};

test("the manifest starts the compensation worker", async (): Promise<void> => {
  const manifest = await readFile(new URL("../../herdr-plugin.toml", import.meta.url), "utf8");

  expect(manifest).toContain("[[startup]]");
  expect(manifest).toContain('command = ["node", "dist/main.mjs", "worker"]');
});

test("worker scans immediately and then on an exact 30 second cadence", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const waits: number[] = [];
  const triggers: WorkerScanTrigger[] = [];
  let waitCount = 0;

  const result = await runWorker({
    isPluginEnabled: async (): Promise<boolean> => true,
    now: (): number => waitCount * 30_000,
    scan: async (trigger: WorkerScanTrigger): Promise<void> => {
      triggers.push(trigger);
    },
    socketPath: "session-a",
    stateDir,
    wait: async (delayMs: number): Promise<"stop" | "tick"> => {
      waits.push(delayMs);
      waitCount += 1;
      return waitCount === 1 ? "tick" : "stop";
    },
  });

  expect(triggers).toEqual(["startup", "interval"]);
  expect(waits).toEqual([30_000, 30_000]);
  expect(result).toEqual({ reason: "stopped", rounds: 2 });
});

test("scan duration does not drift the fixed cadence", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const waits: number[] = [];
  let currentTime = 0;

  await runWorker({
    isPluginEnabled: async (): Promise<boolean> => true,
    now: (): number => currentTime,
    scan: async (): Promise<void> => {
      currentTime += 5_000;
    },
    socketPath: "session-a",
    stateDir,
    wait: async (delayMs: number): Promise<"stop"> => {
      waits.push(delayMs);
      return "stop";
    },
  });

  expect(waits).toEqual([25_000]);
});

test("one failed scan does not stop the next interval", async (): Promise<void> => {
  const stateDir = await createStateDir();
  let scanCount = 0;
  let waitCount = 0;

  const result = await runWorker({
    isPluginEnabled: async (): Promise<boolean> => true,
    now: (): number => waitCount * 30_000,
    scan: async (): Promise<void> => {
      scanCount += 1;
      if (scanCount === 1) throw new Error("round failed");
    },
    socketPath: "session-a",
    stateDir,
    wait: async (): Promise<"stop" | "tick"> => {
      waitCount += 1;
      return waitCount === 1 ? "tick" : "stop";
    },
  });

  expect(scanCount).toBe(2);
  expect(result.rounds).toBe(2);
});

test("an abort signal stops the worker and releases its lease", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const controller = new AbortController();
  let scanned: (() => void) | undefined;
  const firstScan = new Promise<void>((resolve: () => void): void => {
    scanned = resolve;
  });
  const worker = runWorker({
    isPluginEnabled: async (): Promise<boolean> => true,
    now: (): number => 0,
    scan: async (): Promise<void> => scanned?.(),
    signal: controller.signal,
    socketPath: "session-a",
    stateDir,
  });
  await firstScan;
  controller.abort();

  expect(await worker).toEqual({ reason: "stopped", rounds: 1 });
  const replacement = await WorkerLease.tryAcquire({
    now: (): number => 0,
    socketPath: "session-a",
    stateDir,
  });
  expect(replacement).not.toBeNull();
  await replacement?.release();
});

test("disabled or missing plugin exits before scanning", async (): Promise<void> => {
  const stateDir = await createStateDir();
  let scanCount = 0;

  const result = await runWorker({
    isPluginEnabled: async (): Promise<boolean> => false,
    scan: async (): Promise<void> => {
      scanCount += 1;
    },
    socketPath: "session-a",
    stateDir,
  });

  expect(result).toEqual({ reason: "disabled_or_missing", rounds: 0 });
  expect(scanCount).toBe(0);
});

test("a lifecycle socket failure exits instead of scanning", async (): Promise<void> => {
  const stateDir = await createStateDir();
  let scanCount = 0;

  const result = await runWorker({
    isPluginEnabled: async (): Promise<boolean> => {
      throw new Error("socket lost");
    },
    scan: async (): Promise<void> => {
      scanCount += 1;
    },
    socketPath: "session-a",
    stateDir,
  });

  expect(result).toEqual({ reason: "herdr_unavailable", rounds: 0 });
  expect(scanCount).toBe(0);
  const diagnosticName = (await readdir(stateDir)).find((name: string): boolean =>
    name.startsWith("diagnostics-"),
  );
  expect(await readFile(join(stateDir, diagnosticName ?? "missing"), "utf8")).toContain(
    '"trigger":"startup"',
  );
});

test("a signal received during lifecycle check prevents scanning", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const controller = new AbortController();
  let finishCheck: (() => void) | undefined;
  let scanCount = 0;
  const worker = runWorker({
    isPluginEnabled: async (): Promise<boolean> =>
      await new Promise<boolean>((resolve: (enabled: boolean) => void): void => {
        finishCheck = (): void => resolve(true);
      }),
    scan: async (): Promise<void> => {
      scanCount += 1;
    },
    signal: controller.signal,
    socketPath: "session-a",
    stateDir,
  });
  while (finishCheck === undefined) {
    await new Promise<void>((resolve: () => void): void => {
      setImmediate(resolve);
    });
  }
  controller.abort();
  finishCheck();

  expect(await worker).toEqual({ reason: "stopped", rounds: 0 });
  expect(scanCount).toBe(0);
});

test("only one worker owns a session and normal stop releases its lease", async (): Promise<void> => {
  const stateDir = await createStateDir();
  let releaseWait: (() => void) | undefined;
  const first = runWorker({
    isPluginEnabled: async (): Promise<boolean> => true,
    now: (): number => 0,
    scan: async (): Promise<void> => undefined,
    socketPath: "session-a",
    stateDir,
    wait: async (): Promise<"stop"> =>
      await new Promise<"stop">((resolve: (result: "stop") => void): void => {
        releaseWait = (): void => resolve("stop");
      }),
  });
  while (releaseWait === undefined) {
    await new Promise<void>((resolve: () => void): void => {
      setImmediate(resolve);
    });
  }

  const duplicate = await runWorker({
    isPluginEnabled: async (): Promise<boolean> => true,
    now: (): number => 0,
    scan: async (): Promise<void> => undefined,
    socketPath: "session-a",
    stateDir,
  });
  releaseWait?.();
  await first;
  const replacement = await WorkerLease.tryAcquire({
    now: (): number => 0,
    socketPath: "session-a",
    stateDir,
  });

  expect(duplicate.reason).toBe("duplicate");
  expect(replacement).not.toBeNull();
  await replacement?.release();
});

test("stale worker slots recover and different sessions never suppress each other", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const stale = await WorkerLease.tryAcquire({
    now: (): number => 0,
    socketPath: "session-a",
    stateDir,
  });
  const recovered = await WorkerLease.tryAcquire({
    now: (): number => 61_000,
    socketPath: "session-a",
    stateDir,
  });
  const otherSession = await WorkerLease.tryAcquire({
    now: (): number => 0,
    socketPath: "session-b",
    stateDir,
  });

  expect(stale).not.toBeNull();
  expect(recovered).not.toBeNull();
  expect(otherSession).not.toBeNull();
  await stale?.release();
  await recovered?.release();
  await otherSession?.release();
});

test("heartbeat preserves ownership during a slow scan", async (): Promise<void> => {
  const stateDir = await createStateDir();
  let currentTime = 0;
  let finishScan: (() => void) | undefined;
  const worker = runWorker({
    heartbeatMs: 5,
    isPluginEnabled: async (): Promise<boolean> => true,
    now: (): number => currentTime,
    scan: async (): Promise<void> =>
      await new Promise<void>((resolve: () => void): void => {
        finishScan = resolve;
      }),
    socketPath: "session-a",
    stateDir,
    wait: async (): Promise<"stop"> => "stop",
  });
  while (finishScan === undefined) {
    await new Promise<void>((resolve: () => void): void => {
      setImmediate(resolve);
    });
  }
  currentTime = 61_000;
  await new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, 20);
  });
  const duplicate = await WorkerLease.tryAcquire({
    now: (): number => currentTime,
    socketPath: "session-a",
    stateDir,
  });
  finishScan();

  expect(duplicate).toBeNull();
  expect((await worker).reason).toBe("stopped");
});
