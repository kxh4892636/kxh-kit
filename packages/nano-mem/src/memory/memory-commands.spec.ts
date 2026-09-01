import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import type { ExecFileException } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runCli, type CliInput } from "../cli.js";
import { nodeRuntime, ProcessExecutionError, type RuntimeDependencies } from "../runtime.js";
import { registerMemoryCommands } from "./memory-commands.js";

interface CliResult {
  code: number;
  error: unknown;
  output: unknown;
  stderr: string;
  stdout: string;
}

let temporaryRoot = "";
let runtime: RuntimeDependencies;
let currentTime = 0;

beforeEach((): void => {
  temporaryRoot = mkdtempSync(join(tmpdir(), "nano-mem-cli-"));
  const projectDirectory = join(temporaryRoot, "current-project");
  mkdirSync(projectDirectory);
  const base = nodeRuntime();
  currentTime = new Date("2026-09-02T00:00:00.000Z").getTime();
  runtime = {
    ...base,
    clock: { now: (): Date => new Date(currentTime) },
    environment: { NANO_MEM_HOME: join(temporaryRoot, "data") },
    paths: { ...base.paths, cwd: projectDirectory },
    processExecutor: {
      execute: vi.fn(
        async (): Promise<never> =>
          Promise.reject(
            new ProcessExecutionError(
              Object.assign(new Error("git failed"), { code: 128 }) as ExecFileException,
              "",
              "fatal: not a git repository",
            ),
          ),
      ),
    },
  };
});

afterEach((): void => {
  rmSync(temporaryRoot, { force: true, recursive: true });
});

const execute = async (argumentsList: string[], input?: CliInput): Promise<CliResult> => {
  let stderr = "";
  let stdout = "";
  const code = await runCli({
    argumentsList,
    input: input ?? { readStdin: async (): Promise<string> => "", stdinIsTerminal: true },
    io: {
      stderr: (text: string): void => {
        stderr += text;
      },
      stdout: (text: string): void => {
        stdout += text;
      },
    },
    registrars: [registerMemoryCommands],
    runtime,
  });
  return {
    code,
    error: stderr === "" ? undefined : JSON.parse(stderr),
    output: stdout === "" ? undefined : JSON.parse(stdout),
    stderr,
    stdout,
  };
};

const memoryId = (result: CliResult): string =>
  (result.output as { data: { memory: { id: string } } }).data.memory.id;

describe("memory CLI storage and input", (): void => {
  test("stores project and global memories without crossing project boundaries", async (): Promise<void> => {
    await execute(["add", "current memory"]);
    await execute(["add", "global memory", "--scope", "global"]);
    await execute(["add", "other memory", "--project", "other"]);
    const current = await execute(["list"]);
    const other = await execute(["list", "--project", "other"]);
    expect(current.code).toBe(0);
    expect(
      (current.output as { data: { memories: Array<{ content: string }> } }).data.memories.map(
        (memory: { content: string }): string => memory.content,
      ),
    ).toEqual(expect.arrayContaining(["current memory", "global memory"]));
    expect(JSON.stringify(current.output)).not.toContain("other memory");
    expect(JSON.stringify(other.output)).toContain("other memory");
    expect(JSON.stringify(other.output)).toContain("global memory");
  });

  test("adds content from stdin and reports ambiguous input as usage", async (): Promise<void> => {
    const fromStdin = await execute(["add"], {
      readStdin: async (): Promise<string> => "piped memory\n",
      stdinIsTerminal: false,
    });
    const ambiguous = await execute(["add", "argument memory"], {
      readStdin: async (): Promise<string> => "piped memory",
      stdinIsTerminal: false,
    });
    expect(fromStdin).toMatchObject({ code: 0 });
    expect(JSON.stringify(fromStdin.output)).toContain("piped memory");
    expect(ambiguous).toMatchObject({
      code: 2,
      error: { error: { code: "AMBIGUOUS_TEXT_INPUT" }, ok: false },
    });
  });

  test("returns the same id for an exact normalized duplicate", async (): Promise<void> => {
    const first = await execute(["add", "Ａ  durable memory"]);
    const duplicate = await execute(["add", "A durable memory"]);
    expect(memoryId(duplicate)).toBe(memoryId(first));
    expect(duplicate.output).toMatchObject({ data: { created: false }, ok: true });
  });
});

describe("memory CLI maintenance", (): void => {
  test("gets and updates memory content or source", async (): Promise<void> => {
    const added = await execute(["add", "before", "--source", "first"]);
    const id = memoryId(added);
    const sourceUpdated = await execute(["update", id, "--source", "second"]);
    const contentUpdated = await execute(["update", id, "after"]);
    const retrieved = await execute(["get", id]);
    expect(sourceUpdated.output).toMatchObject({ data: { content: "before", source: "second" } });
    expect(contentUpdated.output).toMatchObject({ data: { content: "after", id } });
    expect(retrieved.output).toMatchObject({ data: { content: "after", id, source: "second" } });
  });

  test("requires force for permanent deletion", async (): Promise<void> => {
    const added = await execute(["add", "delete target"]);
    const id = memoryId(added);
    const refused = await execute(["delete", id]);
    const stillPresent = await execute(["get", id]);
    const deleted = await execute(["delete", id, "--force"]);
    const missing = await execute(["get", id]);
    expect(refused).toMatchObject({
      code: 2,
      error: { error: { code: "DELETE_REQUIRES_FORCE" }, ok: false },
    });
    expect(stillPresent.code).toBe(0);
    expect(deleted).toMatchObject({ code: 0, output: { data: { deleted: { id } }, ok: true } });
    expect(missing).toMatchObject({
      code: 1,
      error: { error: { code: "MEMORY_NOT_FOUND" }, ok: false },
    });
  });

  test("requires an explicit global write scope for global maintenance", async (): Promise<void> => {
    const added = await execute(["add", "global target", "--scope", "global"]);
    const id = memoryId(added);
    const defaultUpdate = await execute(["update", id, "updated"]);
    const globalUpdate = await execute(["update", id, "updated", "--scope", "global"]);
    const globalDelete = await execute(["delete", id, "--scope", "global", "--force"]);
    expect(defaultUpdate).toMatchObject({
      code: 1,
      error: { error: { code: "MEMORY_NOT_FOUND" } },
    });
    expect(globalUpdate).toMatchObject({ code: 0, output: { data: { content: "updated" } } });
    expect(globalDelete).toMatchObject({ code: 0, output: { data: { deleted: { id } } } });
  });

  test("rejects invalid read and write scopes", async (): Promise<void> => {
    const add = await execute(["add", "memory", "--scope", "all"]);
    const list = await execute(["list", "--scope", "everywhere"]);
    const update = await execute(["update", "memory-id", "new", "--scope", "all"]);
    expect(add).toMatchObject({ code: 2, error: { error: { code: "INVALID_SCOPE" } } });
    expect(list).toMatchObject({ code: 2, error: { error: { code: "INVALID_SCOPE" } } });
    expect(update).toMatchObject({ code: 2, error: { error: { code: "INVALID_SCOPE" } } });
  });
});

describe("memory CLI search", (): void => {
  test("searches current project and global memories by default", async (): Promise<void> => {
    await execute(["add", "当前项目使用缓存策略"]);
    await execute(["add", "global cache policy", "--scope", "global"]);
    await execute(["add", "other cache secret", "--project", "other"]);
    const result = await execute(["search", "cache"]);
    const projectOnly = await execute(["search", "cache", "--scope", "project"]);
    const globalOnly = await execute(["search", "cache", "--scope", "global"]);
    const otherProject = await execute([
      "search",
      "cache",
      "--scope",
      "project",
      "--project",
      "other",
    ]);
    expect(result.code).toBe(0);
    expect(JSON.stringify(result.output)).toContain("global cache policy");
    expect(JSON.stringify(result.output)).not.toContain("other cache secret");
    expect(JSON.stringify(projectOnly.output)).not.toContain("global cache policy");
    expect(JSON.stringify(globalOnly.output)).toContain("global cache policy");
    expect(JSON.stringify(otherProject.output)).toContain("other cache secret");
    const chinese = await execute(["search", "缓存"]);
    expect(JSON.stringify(chinese.output)).toContain("当前项目使用缓存策略");
  });

  test("accepts literal punctuation and validates search limits", async (): Promise<void> => {
    await execute(["add", "title operator memory"]);
    const punctuation = await execute(["search", 'title OR "memory" -drop:();']);
    const zero = await execute(["search", "title", "--limit", "0"]);
    const aboveMaximum = await execute(["search", "title", "--limit", "51"]);
    const decimal = await execute(["search", "title", "--limit", "1.5"]);
    expect(punctuation).toMatchObject({ code: 0 });
    expect(zero).toMatchObject({ code: 2, error: { error: { code: "INVALID_LIMIT" } } });
    expect(aboveMaximum).toMatchObject({
      code: 2,
      error: { error: { code: "INVALID_LIMIT" } },
    });
    expect(decimal).toMatchObject({ code: 2, error: { error: { code: "INVALID_LIMIT" } } });
  });
});

describe("memory CLI lifecycle", (): void => {
  test("forgets, exposes the reason, rejects use, and restores", async (): Promise<void> => {
    const added = await execute(["add", "lifecycle target"]);
    const id = memoryId(added);
    const used = await execute(["use", id]);
    const forgotten = await execute(["forget", id]);
    const hidden = await execute(["search", "lifecycle target"]);
    const retrieved = await execute(["get", id]);
    const refusedUse = await execute(["use", id]);
    const restored = await execute(["restore", id]);
    const visible = await execute(["search", "lifecycle target"]);
    expect(used.output).toMatchObject({ data: { forgottenReason: null, status: "active" } });
    expect(forgotten.output).toMatchObject({
      data: { forgottenReason: "explicit", status: "forgotten" },
    });
    expect(hidden.output).toMatchObject({ data: { memories: [] } });
    expect(retrieved.output).toMatchObject({
      data: { forgottenReason: "explicit", status: "forgotten" },
    });
    expect(refusedUse).toMatchObject({
      code: 1,
      error: { error: { code: "MEMORY_FORGOTTEN" } },
    });
    expect(restored.output).toMatchObject({
      data: { forgottenReason: null, id, status: "active" },
    });
    expect(JSON.stringify(visible.output)).toContain("lifecycle target");
  });

  test("evaluates natural forgetting lazily without heating get or list", async (): Promise<void> => {
    const added = await execute(["add", "naturally forgotten target"]);
    const id = memoryId(added);
    currentTime += 209 * 86_400_000;
    const hidden = await execute(["search", "naturally forgotten target"]);
    const retrieved = await execute(["get", id]);
    const listed = await execute(["list"]);
    expect(hidden.output).toMatchObject({ data: { memories: [] } });
    expect(retrieved.output).toMatchObject({
      data: { forgottenReason: "natural", status: "forgotten" },
    });
    expect(listed.output).toMatchObject({
      data: { memories: [{ forgottenReason: "natural", id, status: "forgotten" }] },
    });
  });
});
