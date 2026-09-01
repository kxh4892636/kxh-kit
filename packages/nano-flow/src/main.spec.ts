import { channel } from "node:diagnostics_channel";
import { describe, expect, test, vi } from "vitest";
import { command, group } from "./cli/definition";
import type { BuiltinCommand, InvocationContext, JsonOutput } from "./cli/types";
import { isClosedInput, nodeRuntime, runMain, type MainRuntime } from "./main-runtime";

const inputCommand = group("test", "Test input", [
  command("input", "Read input", [], {
    kind: "query",
    run: async (_options, context: InvocationContext): Promise<JsonOutput> => ({
      all: (await context.stdin.readAll?.()) ?? null,
      line: await context.stdin.readLine(),
    }),
  }),
]);

const runtime = (
  options: {
    readonly argv?: readonly string[];
    readonly chunks?: readonly string[];
    readonly close?: () => void;
    readonly question?: (prompt: string) => Promise<string>;
  } = {},
): MainRuntime & { readonly output: { stderr: string; stdout: string } } => {
  const output = { stderr: "", stdout: "" };
  const chunks = options.chunks ?? [];
  return {
    argv: options.argv ?? ["test", "input", "--compact"],
    cwd: (): string => "C:/workspace",
    env: {},
    input: {
      on: vi.fn(),
      [Symbol.asyncIterator]: async function* (): AsyncGenerator<string> {
        yield* chunks;
      },
    } as unknown as MainRuntime["input"],
    modules: [(): BuiltinCommand => inputCommand],
    onSigint: vi.fn(),
    offSigint: vi.fn(),
    openLineReader: (): Pick<import("node:readline/promises").Interface, "close" | "question"> => ({
      close: options.close ?? vi.fn(),
      question: options.question ?? (async (): Promise<string> => "answer"),
    }),
    stdout: { write: (chunk: string): void => void (output.stdout += chunk) },
    stderr: { write: (chunk: string): void => void (output.stderr += chunk) },
    output,
  };
};

describe("node entry point", (): void => {
  test("passes complete and line input through the CLI request", async (): Promise<void> => {
    const close = vi.fn();
    const question = vi.fn(async (): Promise<string> => "answer");
    const testRuntime = runtime({ chunks: ["one", "two"], close, question });
    await expect(runMain(testRuntime)).resolves.toBe(0);
    expect(JSON.parse(testRuntime.output.stdout)).toEqual({ all: "onetwo", line: "answer" });
    expect(question).toHaveBeenCalledExactlyOnceWith("");
    expect(close).toHaveBeenCalledOnce();
    expect(testRuntime.onSigint).toHaveBeenCalledOnce();
    expect(testRuntime.offSigint).toHaveBeenCalledOnce();
  });

  test.each(["ERR_USE_AFTER_CLOSE", "ABORT_ERR"])(
    "treats %s as closed input",
    (code: string): void => {
      expect(isClosedInput({ code })).toBe(true);
    },
  );

  test.each([null, "closed", {}, { code: "OTHER" }])(
    "does not misclassify an open input error",
    (error: unknown): void => {
      expect(isClosedInput(error)).toBe(false);
    },
  );

  test("returns null after a closed line reader", async (): Promise<void> => {
    const testRuntime = runtime({
      question: async (): Promise<never> => Promise.reject({ code: "ERR_USE_AFTER_CLOSE" }),
    });
    await expect(runMain(testRuntime)).resolves.toBe(0);
    expect(JSON.parse(testRuntime.output.stdout)).toMatchObject({ line: null });
  });

  test.each([new Error("read failed"), "read failed"])(
    "reports other line reader errors",
    async (failure: unknown): Promise<void> => {
      const events: unknown[] = [];
      const diagnosticChannel = channel("nf.input");
      const subscriber = (message: unknown): void => void events.push(message);
      diagnosticChannel.subscribe(subscriber);
      try {
        const testRuntime = runtime({
          question: async (): Promise<never> => Promise.reject(failure),
        });
        await expect(runMain(testRuntime)).resolves.toBe(1);
        expect(testRuntime.output.stderr).toContain("read failed");
        expect(events).toEqual([
          { level: "error", message: "Unable to read review input: read failed" },
        ]);
      } finally {
        diagnosticChannel.unsubscribe(subscriber);
      }
    },
  );

  test("aborts and closes an active line reader on SIGINT", async (): Promise<void> => {
    let listener: (() => void) | undefined;
    const close = vi.fn();
    const testRuntime = runtime();
    testRuntime.onSigint = (registered: () => void): void => void (listener = registered);
    testRuntime.openLineReader = (): { close: () => void; question: () => Promise<never> } => ({
      close,
      question: async (): Promise<never> => {
        listener?.();
        return Promise.reject({ code: "ABORT_ERR" });
      },
    });

    await expect(runMain(testRuntime)).resolves.toBe(0);
    expect(close).toHaveBeenCalledTimes(2);
  });

  test("node runtime exposes the current process wiring", (): void => {
    const current = nodeRuntime();
    expect(current.argv).toEqual(process.argv.slice(2));
    expect(current.cwd()).toBe(process.cwd());
    expect(current.env).toBe(process.env);
    expect(current.input).toBe(process.stdin);
    expect(current.stdout).toBe(process.stdout);
    expect(current.stderr).toBe(process.stderr);

    const listener = (): void => undefined;
    current.onSigint(listener);
    expect(process.listeners("SIGINT")).toContain(listener);
    current.offSigint(listener);
    expect(process.listeners("SIGINT")).not.toContain(listener);

    const reader = current.openLineReader(process.stdin);
    expect(typeof reader.question).toBe("function");
    expect(typeof reader.close).toBe("function");
    reader.close();
  });
});
