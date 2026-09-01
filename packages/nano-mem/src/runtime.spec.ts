import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { nodeRuntime } from "./runtime.js";

describe("node runtime composition root", (): void => {
  test("provides clock and path seams", (): void => {
    const runtime = nodeRuntime();
    expect(runtime.clock.now()).toBeInstanceOf(Date);
    expect(runtime.paths.cwd).toBe(process.cwd());
    expect(runtime.paths.home.length).toBeGreaterThan(0);
    expect(runtime.paths.resolve("one", "two")).toBe(resolve("one", "two"));
  });

  test("opens an isolated SQLite database through the factory", (): void => {
    const database = nodeRuntime().databaseFactory.open(":memory:");
    expect(database.prepare("SELECT 1 AS value").get()).toEqual({ value: 1 });
    database.close();
  });

  test("executes a process without a shell", async (): Promise<void> => {
    const result = await nodeRuntime().processExecutor.execute({
      argumentsList: ["-e", "process.stdout.write('ready')"],
      command: process.execPath,
    });
    expect(result).toEqual({ stderr: "", stdout: "ready" });
  });

  test("rejects failed process execution", async (): Promise<void> => {
    await expect(
      nodeRuntime().processExecutor.execute({
        argumentsList: ["-e", "process.exit(7)"],
        command: process.execPath,
      }),
    ).rejects.toMatchObject({ exitCode: 7 });
  });
});
