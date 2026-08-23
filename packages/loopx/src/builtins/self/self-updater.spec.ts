import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, type CliRequest } from "../../cli/run";
import type { BuiltinCommand } from "../../cli/types";
import { createSelfCommand, type SelfCommandDependencies } from "./self-command";
import type { ManagedSkill } from "./skill-catalog";
import { hashSkillFiles } from "./skill-files";
import type { PackageManagerPort, ResolvedLoopxPackage } from "./self-updater";

interface ScriptState {
  version: string;
  readonly resolves: { selector: string; includePrerelease: boolean }[];
  readonly installs: string[];
  readonly rollbacks: string[];
  failResolve: boolean;
  failInstall: boolean;
}

interface Result {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const directories: string[] = [];

const managedSkill = (version: string, content: string): ManagedSkill => {
  const files = [{ path: "SKILL.md", content }];
  return { name: "loop-x", version, contentHash: hashSkillFiles(files), files };
};

const scriptedPort = (state: ScriptState, candidate: ResolvedLoopxPackage): PackageManagerPort => ({
  resolve: async (selector: string, includePrerelease: boolean): Promise<ResolvedLoopxPackage> => {
    state.resolves.push({ selector, includePrerelease });
    if (state.failResolve) throw new Error("resolve failed");
    return candidate;
  },
  install: async (version: string): Promise<void> => {
    state.installs.push(version);
    if (state.failInstall) throw new Error("install failed");
    state.version = version;
  },
  rollback: async (version: string): Promise<void> => {
    state.rollbacks.push(version);
    state.version = version;
  },
});

const invoke = async (
  catalog: readonly ManagedSkill[],
  target: string,
  argv: readonly string[],
  dependencies: SelfCommandDependencies,
): Promise<Result> => {
  let stdout = "";
  let stderr = "";
  const request: CliRequest = {
    argv: ["self", ...argv, "--target", target, "--compact"],
    cwd: target,
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
  const code = await runCli(request, [
    (): BuiltinCommand => createSelfCommand(catalog, dependencies),
  ]);
  return { code, stdout, stderr };
};

const state = (): ScriptState => ({
  version: "1.0.0",
  resolves: [],
  installs: [],
  rollbacks: [],
  failResolve: false,
  failInstall: false,
});

const createTarget = async (): Promise<string> => {
  const target = await mkdtemp(path.join(tmpdir(), "loopx-self-update-"));
  directories.push(target);
  return target;
};

const installCurrentSkill = async (
  current: ManagedSkill,
  target: string,
  dependencies: SelfCommandDependencies,
): Promise<void> => {
  const result = await invoke(
    [current],
    target,
    ["skill", "install", "--name", "loop-x"],
    dependencies,
  );
  expect(result.code).toBe(0);
};

afterEach(async (): Promise<void> => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory: string): Promise<void> => rm(directory, { force: true, recursive: true })),
  );
});

describe("self update orchestration", (): void => {
  test("updates latest and synchronizes installed skills", async (): Promise<void> => {
    const target = await createTarget();
    const current = managedSkill("1.0.0", "old");
    const candidate = managedSkill("2.0.0", "new");
    const script = state();
    const dependencies = {
      currentVersion: "1.0.0",
      packageManager: scriptedPort(script, { version: "2.0.0", skills: [candidate] }),
    };
    await installCurrentSkill(current, target, dependencies);
    const result = await invoke([current], target, ["update"], dependencies);
    expect(result.code).toBe(0);
    expect(script.resolves).toEqual([{ selector: "latest", includePrerelease: false }]);
    expect(script.installs).toEqual(["2.0.0"]);
    expect(await readFile(path.join(target, "loop-x", "SKILL.md"), "utf8")).toBe("new");
  });

  test.each(["2.1.0", "next"])(
    "passes explicit selector %s",
    async (selector: string): Promise<void> => {
      const target = await createTarget();
      const current = managedSkill("1.0.0", "old");
      const candidate = managedSkill("2.1.0", "new");
      const script = state();
      const dependencies = {
        currentVersion: "1.0.0",
        packageManager: scriptedPort(script, { version: "2.1.0", skills: [candidate] }),
      };
      const result = await invoke(
        [current],
        target,
        ["update", "--version", selector, "--dry-run"],
        dependencies,
      );
      expect(result.code).toBe(0);
      expect(script.resolves).toEqual([{ selector, includePrerelease: true }]);
      expect(script.installs).toEqual([]);
    },
  );

  test("dry-run returns the CLI and skill plan without changing either", async (): Promise<void> => {
    const target = await createTarget();
    const current = managedSkill("1.0.0", "old");
    const candidate = managedSkill("2.0.0", "new");
    const script = state();
    const dependencies = {
      currentVersion: "1.0.0",
      packageManager: scriptedPort(script, { version: "2.0.0", skills: [candidate] }),
    };
    await installCurrentSkill(current, target, dependencies);
    const before = await readFile(path.join(target, "loop-x", "SKILL.md"), "utf8");
    const result = await invoke([current], target, ["update", "--dry-run"], dependencies);
    expect(JSON.parse(result.stdout)).toMatchObject({
      dryRun: true,
      preview: {
        candidateVersion: "2.0.0",
        cli: { action: "install", version: "2.0.0" },
        skills: { changes: [{ action: "update", name: "loop-x" }] },
      },
    });
    expect([script.installs, script.rollbacks]).toEqual([[], []]);
    expect(await readFile(path.join(target, "loop-x", "SKILL.md"), "utf8")).toBe(before);
  });

  test("returns success without writes when already current", async (): Promise<void> => {
    const target = await createTarget();
    const current = managedSkill("1.0.0", "old");
    const script = state();
    const dependencies = {
      currentVersion: "1.0.0",
      packageManager: scriptedPort(script, { version: "1.0.0", skills: [current] }),
    };
    const result = await invoke([current], target, ["update"], dependencies);
    expect(JSON.parse(result.stdout)).toMatchObject({ updateAvailable: false });
    expect(script.installs).toEqual([]);
  });

  test("surfaces query failure without install or rollback", async (): Promise<void> => {
    const target = await createTarget();
    const current = managedSkill("1.0.0", "old");
    const script = state();
    script.failResolve = true;
    const dependencies = {
      currentVersion: "1.0.0",
      packageManager: scriptedPort(script, { version: "2.0.0", skills: [] }),
    };
    expect((await invoke([current], target, ["update"], dependencies)).code).toBe(1);
    expect([script.installs, script.rollbacks]).toEqual([[], []]);
  });

  test("rolls back CLI after install or skill synchronization failure", async (): Promise<void> => {
    const target = await createTarget();
    const current = managedSkill("1.0.0", "old");
    const candidate = managedSkill("2.0.0", "new");
    const installScript = state();
    installScript.failInstall = true;
    const installDependencies = {
      currentVersion: "1.0.0",
      packageManager: scriptedPort(installScript, { version: "2.0.0", skills: [candidate] }),
    };
    await installCurrentSkill(current, target, installDependencies);
    expect((await invoke([current], target, ["update"], installDependencies)).code).toBe(1);
    expect([installScript.version, installScript.rollbacks]).toEqual(["1.0.0", ["1.0.0"]]);
    expect(await readFile(path.join(target, "loop-x", "SKILL.md"), "utf8")).toBe("old");

    const syncScript = state();
    const syncDependencies: SelfCommandDependencies = {
      currentVersion: "1.0.0",
      packageManager: scriptedPort(syncScript, { version: "2.0.0", skills: [candidate] }),
      beforeReplace: async (): Promise<void> => {
        throw new Error("sync failed");
      },
    };
    expect((await invoke([current], target, ["update"], syncDependencies)).code).toBe(1);
    expect([syncScript.version, syncScript.rollbacks]).toEqual(["1.0.0", ["1.0.0"]]);
    expect(await readFile(path.join(target, "loop-x", "SKILL.md"), "utf8")).toBe("old");
  });
});
