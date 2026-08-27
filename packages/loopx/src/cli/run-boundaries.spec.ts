import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import fixtureCommand from "../builtins/fixture";
import { command, group, option } from "./definition";
import { runCli, type CliRequest } from "./run";
import type { BuiltinCommand, BuiltinModuleFactory, JsonOutput, OptionValues } from "./types";

const invoke = async (
  argv: readonly string[],
  commands: readonly BuiltinCommand[],
): Promise<{ code: number; stderr: string; stdout: string }> => {
  let stderr = "";
  let stdout = "";
  const request: CliRequest = {
    argv,
    cwd: process.cwd(),
    env: {},
    signal: new AbortController().signal,
    stdin: { readLine: async (): Promise<null> => null },
    stderr: { write: (chunk: string): void => void (stderr += chunk) },
    stdout: { write: (chunk: string): void => void (stdout += chunk) },
  };
  const modules = commands.map(
    (builtin: BuiltinCommand): BuiltinModuleFactory =>
      (): BuiltinCommand =>
        builtin,
  );
  return { code: await runCli(request, modules), stderr, stdout };
};

const read = command("read", "Read", [], {
  kind: "query",
  run: async (): Promise<JsonOutput> => ({}),
});

describe("CLI definition and scanner boundaries", (): void => {
  test("scans inline root string options and boolean root options", async (): Promise<void> => {
    const root = group(
      "root",
      "Root",
      [
        command("read", "Read", [], {
          kind: "query",
          run: async (options: OptionValues): Promise<JsonOutput> => ({
            scope: options["scope"] ?? false,
            token: options["token"] ?? null,
          }),
        }),
      ],
      [option.boolean("scope", "Scope", {}), option.string("token", "Token", {})],
    );
    const result = await invoke(["root", "--scope", "--token=value", "read"], [root]);
    expect(JSON.parse(result.stdout)).toEqual({ scope: true, token: "value" });
  });

  test.each([
    ["boolean with value", ["root", "--scope=true", "read"]],
    ["missing string", ["root", "--token"]],
    ["option-looking string", ["root", "--token", "--unknown", "read"]],
  ])("rejects scoped scanner input: %s", async (_name, argv): Promise<void> => {
    const root = group(
      "root",
      "Root",
      [read],
      [option.boolean("scope", "Scope", {}), option.string("token", "Token", {})],
    );
    expect((await invoke(argv, [root])).code).toBe(2);
  });

  test("includes debug details for runtime failures", async (): Promise<void> => {
    const result = await invoke(["fixture", "fail", "--debug", "--compact"], [fixtureCommand]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).stack).toBeDefined();
  });

  test("writes pretty event streams", async (): Promise<void> => {
    const result = await invoke(["fixture", "stream"], [fixtureCommand]);
    expect(result.stdout).toContain('\n  "event": "first"\n');
  });

  test.each([
    [["fixture", "echo", "--value", "Hello", "--upper"], { value: "HELLO" }],
    [["fixture", "echo", "--value", "Hello", "--lower"], { value: "hello" }],
    [["fixture", "mutate", "--value", "x"], { action: "mutate", committed: true, value: "x" }],
  ])("executes fixture boundary %#", async (argv, expected): Promise<void> => {
    const result = await invoke(argv as string[], [fixtureCommand]);
    expect(JSON.parse(result.stdout)).toEqual(expected);
  });

  test.each([
    [null, "null\n"],
    ["text", '"text"\n'],
    [7, "7\n"],
    [false, "false\n"],
  ])("writes primitive query output %#", async (value, expected): Promise<void> => {
    const root = group("root", "Root", [
      command("read", "Read", [], {
        kind: "query",
        run: async (): Promise<JsonOutput> => value,
      }),
    ]);
    expect(await invoke(["root", "read", "--compact"], [root])).toEqual({
      code: 0,
      stderr: "",
      stdout: expected,
    });
  });

  test("keeps generated help options and descriptions stable", async (): Promise<void> => {
    const root = group(
      "root",
      "Root description",
      [
        command(
          "read",
          "Read description",
          [
            option.string("name", "Name description", {
              required: true,
              multiple: true,
              placeholder: "item",
            }),
            option.string("value", "Value description", {}),
            option.string("no-text", "No text description", {}),
            option.boolean("no-cache", "Disable cache", {}),
          ],
          { kind: "query", run: async (): Promise<JsonOutput> => ({}) },
        ),
      ],
      [option.boolean("verbose", "Verbose description", {})],
    );
    const result = await invoke(["root", "read", "--help"], [root]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(createHash("sha256").update(result.stdout).digest("hex")).toBe(
      "2db19e1d3d05fb554cd93f7b9ec82514e85090f54e2e72d4831f10da9f36a132",
    );
  });
});

describe("CLI definition and scanner boundaries", (): void => {
  test.each<readonly [string, BuiltinCommand, string]>([
    [
      "invalid option name",
      group("root", "Root", [
        command("read", "Read", [option.boolean("Bad", "Bad", {})], {
          kind: "query",
          run: async (): Promise<JsonOutput> => ({}),
        }),
      ]),
      "Invalid option name at root read: Bad",
    ],
    [
      "duplicate option",
      group("root", "Root", [
        command(
          "read",
          "Read",
          [option.boolean("same", "One", {}), option.boolean("same", "Two", {})],
          { kind: "query", run: async (): Promise<JsonOutput> => ({}) },
        ),
      ]),
      "Duplicate option at root read: --same",
    ],
    [
      "unknown conflict",
      group("root", "Root", [
        command("read", "Read", [option.boolean("one", "One", { conflicts: ["missing"] })], {
          kind: "query",
          run: async (): Promise<JsonOutput> => ({}),
        }),
      ]),
      "Unknown conflict at root read: --missing",
    ],
    [
      "reserved option",
      group("root", "Root", [
        command("read", "Read", [option.boolean("debug", "Debug", {})], {
          kind: "query",
          run: async (): Promise<JsonOutput> => ({}),
        }),
      ]),
      "Reserved option at root read: --debug",
    ],
    [
      "invalid command name",
      group("root", "Root", [{ ...read, name: "Bad" }]),
      "Invalid command path: root Bad",
    ],
    [
      "duplicate command",
      group("root", "Root", [read, { ...read }]),
      "Duplicate command path: root read",
    ],
    [
      "empty group",
      group("root", "Root", [group("empty", "Empty", [])]),
      "Empty command group: root empty",
    ],
    [
      "missing query stage",
      group("root", "Root", [{ ...read, operation: { kind: "query" } } as unknown as typeof read]),
      "Query is missing run stage: root read",
    ],
    [
      "missing mutation stage",
      group("root", "Root", [
        { ...read, operation: { kind: "mutation" } } as unknown as typeof read,
      ]),
      "Mutation is missing prepare stage: root read",
    ],
    [
      "conditional missing prepare",
      group("root", "Root", [
        {
          ...read,
          operation: {
            kind: "conditional",
            mode: (): "query" => "query",
            run: async (): Promise<JsonOutput> => ({}),
          },
        } as unknown as typeof read,
      ]),
      "Conditional operation is incomplete: root read",
    ],
    [
      "conditional missing run",
      group("root", "Root", [
        {
          ...read,
          operation: {
            kind: "conditional",
            mode: (): "query" => "query",
            prepare: async (): Promise<never> => Promise.reject(new Error("unused")),
          },
        } as unknown as typeof read,
      ]),
      "Conditional operation is incomplete: root read",
    ],
    [
      "conditional missing mode",
      group("root", "Root", [
        {
          ...read,
          operation: {
            kind: "conditional",
            prepare: async (): Promise<never> => Promise.reject(new Error("unused")),
            run: async (): Promise<JsonOutput> => ({}),
          },
        } as unknown as typeof read,
      ]),
      "Conditional operation is incomplete: root read",
    ],
    [
      "incomplete conditional stage",
      group("root", "Root", [
        {
          ...read,
          operation: { kind: "conditional", mode: (): "query" => "query" },
        } as unknown as typeof read,
      ]),
      "Conditional operation is incomplete: root read",
    ],
    [
      "unknown operation",
      group("root", "Root", [{ ...read, operation: { kind: "other" } } as unknown as typeof read]),
      "Unknown operation at: root read",
    ],
  ])("rejects an invalid definition: %s", async (_name, root, expected): Promise<void> => {
    const result = await invoke(["root", "read", "--compact"], [root as BuiltinCommand]);
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: `${JSON.stringify({ success: false, error: expected })}\n`,
    });
  });
});
