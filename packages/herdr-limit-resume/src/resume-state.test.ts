import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { ResumeState } from "./resume-state.js";
import { sessionFile } from "./session-file.js";

const stateDirs: string[] = [];

afterEach(async (): Promise<void> => {
  await Promise.all(
    stateDirs.splice(0).map(async (stateDir: string): Promise<void> => {
      await rm(stateDir, { force: true, recursive: true });
    }),
  );
});

const createStateDir = async (): Promise<string> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  stateDirs.push(stateDir);
  return stateDir;
};

test("a repeated fingerprint is throttled until the retry interval elapses", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const state = await ResumeState.open(stateDir, "socket");

  expect(state.canRetry("terminal", "hash", 1_000, 100)).toBe(true);
  await state.record("terminal", "hash", 1_000);

  expect(state.canRetry("terminal", "hash", 1_099, 100)).toBe(false);
  expect(state.canRetry("terminal", "hash", 1_100, 100)).toBe(true);
});

test("a changed fingerprint can retry without waiting", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const state = await ResumeState.open(stateDir, "socket");

  await state.record("terminal", "old-hash", 1_000);

  expect(state.canRetry("terminal", "new-hash", 1_001, 100)).toBe(true);
});

test("legacy handled state is migrated into an immediately retryable cooldown", async (): Promise<void> => {
  const stateDir = await createStateDir();
  await writeFile(
    sessionFile(stateDir, "socket", "resume", "json"),
    `${JSON.stringify({ handled: { terminal: "hash" }, version: 1 })}\n`,
  );

  const state = await ResumeState.open(stateDir, "socket");

  expect(state.canRetry("terminal", "hash", 30_000, 30_000)).toBe(true);
});
