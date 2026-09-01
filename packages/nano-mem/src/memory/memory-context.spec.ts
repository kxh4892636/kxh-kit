import { basename, join, resolve } from "node:path";
import type { ExecFileException } from "node:child_process";
import { describe, expect, test, vi } from "vitest";
import { nodeRuntime, ProcessExecutionError, type RuntimeDependencies } from "../runtime.js";
import { resolveMemoryContext } from "./memory-context.js";

const runtimeFor = (options: {
  cwd: string;
  environment?: Readonly<Record<string, string | undefined>>;
  gitRoot?: string;
  home?: string;
  platform?: NodeJS.Platform;
}): RuntimeDependencies => {
  const base = nodeRuntime();
  return {
    ...base,
    environment: options.environment ?? {},
    paths: {
      ...base.paths,
      basename: (path: string): string => basename(path),
      cwd: options.cwd,
      home: options.home ?? "C:\\Users\\memory",
      join: (...segments: string[]): string => join(...segments),
      platform: options.platform ?? "win32",
      resolve: (...segments: string[]): string => resolve(...segments),
    },
    processExecutor: {
      execute:
        options.gitRoot === undefined
          ? vi.fn(
              async (): Promise<never> =>
                Promise.reject(
                  new ProcessExecutionError(
                    Object.assign(new Error("git failed"), { code: 128 }) as ExecFileException,
                    "",
                    "fatal: not a git repository",
                  ),
                ),
            )
          : vi.fn(
              async (): Promise<{ stderr: string; stdout: string }> => ({
                stderr: "",
                stdout: `${options.gitRoot}\n`,
              }),
            ),
    },
  };
};

describe("memory context", (): void => {
  test("uses explicit project and NANO_MEM_HOME without invoking Git", async (): Promise<void> => {
    const runtime = runtimeFor({
      cwd: "C:\\work\\ignored",
      environment: { NANO_MEM_HOME: "C:\\memory-data" },
    });
    const context = await resolveMemoryContext(runtime, " chosen ");
    expect(context).toEqual({
      dataDirectory: resolve("C:\\memory-data"),
      databasePath: join(resolve("C:\\memory-data"), "nano-mem.db"),
      projectId: "chosen",
    });
    expect(runtime.processExecutor.execute).not.toHaveBeenCalled();
  });

  test("uses the Git root directory name as the default project", async (): Promise<void> => {
    const context = await resolveMemoryContext(
      runtimeFor({ cwd: "C:\\repo\\nano-flow\\nested", gitRoot: "C:\\repo\\nano-flow" }),
    );
    expect(context.projectId).toBe("nano-flow");
  });

  test("falls back to cwd basename so moved same-name projects share an id", async (): Promise<void> => {
    const first = await resolveMemoryContext(runtimeFor({ cwd: "C:\\one\\shared" }));
    const second = await resolveMemoryContext(runtimeFor({ cwd: "D:\\two\\shared" }));
    expect(first.projectId).toBe("shared");
    expect(second.projectId).toBe("shared");
  });

  test.each([
    ["win32", {}, "C:\\Users\\memory\\AppData\\Local\\nano-mem"],
    ["darwin", {}, "C:\\Users\\memory\\Library\\Application Support\\nano-mem"],
    ["linux", {}, "C:\\Users\\memory\\.local\\share\\nano-mem"],
    ["linux", { XDG_DATA_HOME: "C:\\xdg" }, "C:\\xdg\\nano-mem"],
  ] as const)(
    "resolves the %s default data directory",
    async (
      platform: NodeJS.Platform,
      environment: Readonly<Record<string, string>>,
      expected: string,
    ): Promise<void> => {
      const context = await resolveMemoryContext(
        runtimeFor({ cwd: "C:\\work\\project", environment, platform }),
      );
      expect(context.dataDirectory).toBe(join(...expected.split("\\")));
    },
  );

  test("rejects an empty explicit project", async (): Promise<void> => {
    await expect(resolveMemoryContext(runtimeFor({ cwd: "C:\\work" }), "  ")).rejects.toMatchObject(
      { code: "INVALID_PROJECT" },
    );
  });

  test("does not disguise unexpected Git failures as a cwd project", async (): Promise<void> => {
    const runtime = runtimeFor({ cwd: "C:\\work\\nested", gitRoot: "C:\\work" });
    runtime.processExecutor.execute = vi.fn(
      async (): Promise<never> =>
        Promise.reject(
          new ProcessExecutionError(
            Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" }) as ExecFileException,
            "",
            "",
          ),
        ),
    );
    await expect(resolveMemoryContext(runtime)).rejects.toMatchObject({
      code: "PROJECT_RESOLUTION_FAILED",
    });
  });
});
