import { describe, expect, test } from "vitest";
import type { Command } from "commander";
import { runCli, type CommandContext, type CommandRegistrar } from "./cli.js";

const execute = async (
  argumentsList: string[],
  registrars?: readonly CommandRegistrar[],
): Promise<{ code: number; stderr: string; stdout: string }> => {
  let stderr = "";
  let stdout = "";
  const code = await runCli({
    argumentsList,
    io: {
      stderr: (text: string): void => {
        stderr += text;
      },
      stdout: (text: string): void => {
        stdout += text;
      },
    },
    ...(registrars ? { registrars } : {}),
  });
  return { code, stderr, stdout };
};

describe("nnm CLI contract", (): void => {
  test("returns help as success JSON", async (): Promise<void> => {
    const result = await execute(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({ data: { command: "nnm" }, ok: true });
  });

  test("returns help when no arguments are provided", async (): Promise<void> => {
    const result = await execute([]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ data: { command: "nnm" }, ok: true });
  });

  test("returns version as success JSON", async (): Promise<void> => {
    const result = await execute(["--version"]);
    expect(JSON.parse(result.stdout)).toEqual({ data: { version: "0.0.1" }, ok: true });
  });

  test("returns unknown commands as usage errors", async (): Promise<void> => {
    const result = await execute(["unknown"]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: "USAGE_ERROR", hint: "Run nnm --help for usage." },
      ok: false,
    });
  });

  test("pretty only changes JSON indentation", async (): Promise<void> => {
    const compact = await execute(["--version"]);
    const pretty = await execute(["--pretty", "--version"]);
    expect(JSON.parse(pretty.stdout)).toEqual(JSON.parse(compact.stdout));
    expect(pretty.stdout).toContain('\n  "data"');
  });

  test("normalizes unexpected command failures", async (): Promise<void> => {
    const result = await execute(
      ["explode"],
      [
        (program: Command): void => {
          program.command("explode").action((): never => {
            throw new Error("boom");
          });
        },
      ],
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      error: { code: "RUNTIME_ERROR", message: "boom" },
      ok: false,
    });
  });

  test("serializes one command response without appending root help", async (): Promise<void> => {
    const result = await execute(
      ["inspect"],
      [
        (program: Command, context: CommandContext): void => {
          program.command("inspect").action((): void => {
            context.respond({ inspected: true });
          });
        },
      ],
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toEqual({ data: { inspected: true }, ok: true });
  });

  test("rejects command handlers that do not return a response", async (): Promise<void> => {
    const result = await execute(
      ["silent"],
      [
        (program: Command): void => {
          program.command("silent").action((): void => undefined);
        },
      ],
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: "MISSING_COMMAND_RESPONSE" },
      ok: false,
    });
  });

  test("rejects command handlers that produce multiple responses", async (): Promise<void> => {
    const result = await execute(
      ["duplicate"],
      [
        (program: Command, context: CommandContext): void => {
          program.command("duplicate").action((): void => {
            context.respond({ sequence: 1 });
            context.respond({ sequence: 2 });
          });
        },
      ],
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: "DUPLICATE_COMMAND_RESPONSE" },
      ok: false,
    });
  });

  test("normalizes command registration failures", async (): Promise<void> => {
    const result = await execute(
      ["unused"],
      [
        (): never => {
          throw new Error("registration failed");
        },
      ],
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      error: { code: "RUNTIME_ERROR", message: "registration failed" },
      ok: false,
    });
  });

  test("preserves option-looking positional text after the option terminator", async (): Promise<void> => {
    const result = await execute(
      ["literal", "--", "--pretty"],
      [
        (program: Command, context: CommandContext): void => {
          program
            .command("literal")
            .argument("<content>")
            .action((content: string): void => {
              context.respond({ content });
            });
        },
      ],
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ data: { content: "--pretty" }, ok: true });
  });

  test("rejects undefined response data", async (): Promise<void> => {
    const result = await execute(
      ["undefined-response"],
      [
        (program: Command, context: CommandContext): void => {
          program.command("undefined-response").action((): void => context.respond(undefined));
        },
      ],
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: "MISSING_COMMAND_RESPONSE" },
      ok: false,
    });
  });
});
