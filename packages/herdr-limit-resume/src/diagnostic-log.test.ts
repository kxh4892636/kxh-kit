import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { DiagnosticLog, type DiagnosticTrigger } from "./diagnostic-log.js";

const stateDirs: string[] = [];

afterEach(async (): Promise<void> => {
  await Promise.all(
    stateDirs.splice(0).map(async (stateDir: string): Promise<void> => {
      await rm(stateDir, { force: true, recursive: true });
    }),
  );
});

test("diagnostics rotate without persisting terminal output", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-log-"));
  stateDirs.push(stateDir);
  const firstLog = await DiagnosticLog.open(stateDir, "session-a", {
    maxBytes: 500,
    rotationCount: 8,
  });
  const secondLog = await DiagnosticLog.open(stateDir, "session-a", {
    maxBytes: 500,
    rotationCount: 8,
  });
  const triggers: DiagnosticTrigger[] = ["event", "manual", "startup", "interval"];
  await Promise.all(
    triggers.map(async (trigger: DiagnosticTrigger, index: number): Promise<void> => {
      const log = index % 2 === 0 ? firstLog : secondLog;
      await log.failure("pane-a", "terminal-a", "agent_operation_failed", trigger);
    }),
  );
  const names = (await readdir(stateDir)).filter((name: string): boolean =>
    name.startsWith("diagnostics-"),
  );
  const contents = await Promise.all(
    names.map(
      async (name: string): Promise<string> => await readFile(join(stateDir, name), "utf8"),
    ),
  );
  const sizes = await Promise.all(
    names.map(async (name: string): Promise<number> => (await stat(join(stateDir, name))).size),
  );
  const combined = contents.join("");

  expect(names.length).toBeGreaterThan(1);
  expect(sizes.every((size: number): boolean => size <= 500)).toBe(true);
  expect(combined).toContain('"session_shard"');
  expect(combined).toContain('"region_hash":null');
  for (const trigger of triggers) expect(combined).toContain(`"trigger":"${trigger}"`);
  expect(combined).not.toContain("secret terminal body");
});
