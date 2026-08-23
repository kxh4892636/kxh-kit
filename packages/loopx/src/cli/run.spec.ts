import { describe, expect, test } from "vitest";
import fixtureCommand from "../builtins/fixture/index";
import { command, group, option } from "./definition";
import { runCli, type CliRequest } from "./run";
import type { BuiltinCommand, BuiltinModuleFactory, JsonOutput, PreparedMutation } from "./types";

interface Result {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const invoke = async (
  argv: readonly string[],
  modules: readonly BuiltinModuleFactory[] = [(): BuiltinCommand => fixtureCommand],
): Promise<Result> => {
  let stdout = "";
  let stderr = "";
  const request: CliRequest = {
    argv,
    cwd: process.cwd(),
    env: {},
    signal: new AbortController().signal,
    stdin: { readLine: async (): Promise<null> => null },
    stdout: {
      write: (chunk: string): void => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk: string): void => {
        stderr += chunk;
      },
    },
  };

  const code = await runCli(request, modules);
  return { code, stdout, stderr };
};

describe("CLI public interface", (): void => {
  test("parses required named options", async (): Promise<void> => {
    const result = await invoke(["fixture", "echo", "--value", "hello"]);
    expect(result).toEqual({ code: 0, stdout: '{\n  "value": "hello"\n}\n', stderr: "" });
  });

  test("keeps kebab-case option names aligned with inferred handler keys", async (): Promise<void> => {
    const multiWord = group("typed", "typed option fixture", [
      command(
        "read",
        "read typed option",
        [option.string("display-name", "display name", { required: true })],
        {
          kind: "query",
          run: async (options: Readonly<{ "display-name": string }>): Promise<JsonOutput> => ({
            displayName: options["display-name"],
          }),
        },
      ),
    ]);
    const result = await invoke(
      ["typed", "read", "--display-name", "Loop X"],
      [(): BuiltinCommand => multiWord],
    );
    expect(JSON.parse(result.stdout)).toEqual({ displayName: "Loop X" });
  });

  test("rejects missing and conflicting options as usage errors", async (): Promise<void> => {
    const missing = await invoke(["fixture", "echo"]);
    const conflict = await invoke(["fixture", "echo", "--value", "hello", "--upper", "--lower"]);
    expect([missing.code, conflict.code]).toEqual([2, 2]);
  });

  test.each([{ argv: [] }, { argv: ["fixture"] }, { argv: ["fixture", "echo"] }])(
    "offers help at command depth %#",
    async ({ argv }: { argv: string[] }): Promise<void> => {
      const result = await invoke([...argv, "--help"]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stderr).toBe("");
    },
  );

  test("runs queries during dry-run", async (): Promise<void> => {
    const result = await invoke(["fixture", "--dry-run", "echo", "--value", "hello", "--compact"]);
    expect(result).toEqual({ code: 0, stdout: '{"value":"hello"}\n', stderr: "" });
  });

  test("previews mutations without committing", async (): Promise<void> => {
    let commits = 0;
    const mutation = group("write", "write fixture", [
      command("value", "write value", [option.string("value", "value", { required: true })], {
        kind: "mutation",
        prepare: async (options: Readonly<{ value: string }>): Promise<PreparedMutation> => ({
          preview: { value: options.value },
          commit: async (): Promise<JsonOutput> => {
            commits += 1;
            return { value: options.value };
          },
        }),
      }),
    ]);
    const result = await invoke(
      ["--dry-run", "write", "value", "--value", "hello"],
      [(): BuiltinCommand => mutation],
    );
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      dryRun: true,
      preview: { value: "hello" },
    });
    expect(commits).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("writes asynchronous JSON events", async (): Promise<void> => {
    const result = await invoke(["fixture", "stream", "--compact"]);
    expect(result.stdout).toBe('{"event":"first"}\n{"event":"second"}\n');
  });

  test("writes runtime and usage errors as JSON with distinct exit codes", async (): Promise<void> => {
    const runtime = await invoke(["fixture", "fail", "--compact"]);
    const usage = await invoke(["unknown", "--compact"]);
    expect(JSON.parse(runtime.stderr)).toMatchObject({ success: false, error: "fixture failed" });
    expect(JSON.parse(usage.stderr)).toMatchObject({ success: false });
    expect([runtime.code, usage.code]).toEqual([1, 2]);
  });

  test("validates missing mutation stages before invoking an operation", async (): Promise<void> => {
    let invoked = false;
    const invalid = {
      kind: "group",
      name: "broken",
      description: "broken fixture",
      children: [
        {
          kind: "command",
          name: "write",
          description: "invalid mutation",
          options: [],
          operation: { kind: "mutation" },
        },
      ],
    } as unknown as BuiltinCommand;
    const valid: BuiltinModuleFactory = (): BuiltinCommand => ({
      kind: "group",
      name: "adapter",
      description: "adapter fixture",
      options: [],
      children: [
        {
          kind: "command",
          name: "touch",
          description: "touch adapter",
          options: [],
          operation: {
            kind: "query",
            run: async (): Promise<JsonOutput> => {
              invoked = true;
              return {};
            },
          },
        },
      ],
    });

    const result = await invoke(["adapter", "touch"], [valid, (): BuiltinCommand => invalid]);
    expect([result.code, invoked]).toEqual([1, false]);
  });

  test("rejects duplicate paths and reserved options", async (): Promise<void> => {
    const duplicate = await invoke(
      ["fixture"],
      [(): BuiltinCommand => fixtureCommand, (): BuiltinCommand => fixtureCommand],
    );
    const reserved = group("reserved", "reserved fixture", [
      command("read", "read fixture", [option.boolean("dry-run", "invalid reserved option", {})], {
        kind: "query",
        run: async (): Promise<JsonOutput> => ({}),
      }),
    ]);
    const invalidOption = await invoke(["reserved", "read"], [(): BuiltinCommand => reserved]);
    expect([duplicate.code, invalidOption.code]).toEqual([1, 1]);
  });

  test("does not invoke operations while rendering help or version", async (): Promise<void> => {
    let invoked = false;
    const lazy = group("lazy", "lazy fixture", [
      command("read", "read fixture", [], {
        kind: "query",
        run: async (): Promise<JsonOutput> => {
          invoked = true;
          return {};
        },
      }),
    ]);
    const help = await invoke(["lazy", "--help"], [(): BuiltinCommand => lazy]);
    const version = await invoke(["--version"], [(): BuiltinCommand => lazy]);
    expect([help.code, version.code, invoked]).toEqual([0, 0, false]);
  });
});
