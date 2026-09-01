import { mkdir, mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { type ManagedSkill } from "./skill-catalog";
import { hashSkillFiles } from "./skill-files";
import { prepareSelfUpdate, type PackageManagerPort } from "./self-updater";
import { inspectSkill, readManagedMarker } from "./skill-state";
import { prepareSkillChange } from "./skill-store";
import { createNpmPackageManager, type NpmPackageManagerDependencies } from "./npm-package-manager";

const temporaryDirectories: string[] = [];

const createTarget = async (): Promise<string> => {
  const target = await mkdtemp(path.join(tmpdir(), "nf-self-mutation-"));
  temporaryDirectories.push(target);
  return target;
};

const skill = (version = "2.0.0", content = "packaged"): ManagedSkill => {
  const files = [{ path: "SKILL.md", content }];
  return { name: "alpha", version, contentHash: hashSkillFiles(files), files };
};

const installManaged = async (targetRoot: string, managedSkill: ManagedSkill): Promise<void> => {
  const directory = path.join(targetRoot, managedSkill.name);
  await mkdir(directory, { recursive: true });
  for (const file of managedSkill.files) {
    await writeFile(path.join(directory, file.path), file.content, "utf8");
  }
  await writeFile(
    path.join(directory, ".nano-flow-managed.json"),
    JSON.stringify({
      name: managedSkill.name,
      version: managedSkill.version,
      contentHash: managedSkill.contentHash,
    }),
    "utf8",
  );
};

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory: string): Promise<void> => rm(directory, { force: true, recursive: true })),
  );
});

describe("self mutation boundaries", (): void => {
  test("returns the exact install preview and commit contract", async (): Promise<void> => {
    const targetRoot = await createTarget();
    const packaged = skill();
    const plan = await prepareSkillChange([packaged], {
      kind: "install",
      names: [packaged.name],
      targetRoot,
      force: false,
    });
    const change = {
      name: "alpha",
      action: "install",
      source: "package://skills/alpha",
      target: path.join(targetRoot, "alpha"),
      fromVersion: null,
      toVersion: "2.0.0",
    };

    expect(plan.preview).toStrictEqual({ success: true, changes: [change] });
    await expect(plan.commit()).resolves.toStrictEqual({ success: true, changes: [change] });
    await expect(readFile(path.join(targetRoot, "alpha", "SKILL.md"), "utf8")).resolves.toBe(
      "packaged",
    );
  });

  test("returns exact update and uninstall version transitions", async (): Promise<void> => {
    const targetRoot = await createTarget();
    const installed = skill("1.0.0", "old");
    const packaged = skill("2.0.0", "new");
    await installManaged(targetRoot, installed);

    const update = await prepareSkillChange([packaged], {
      kind: "update",
      names: [packaged.name],
      targetRoot,
      force: false,
    });
    expect(update.preview).toStrictEqual({
      success: true,
      changes: [
        {
          name: "alpha",
          action: "update",
          source: "package://skills/alpha",
          target: path.join(targetRoot, "alpha"),
          fromVersion: "1.0.0",
          toVersion: "2.0.0",
        },
      ],
    });
    await update.commit();

    const uninstall = await prepareSkillChange([packaged], {
      kind: "uninstall",
      names: [packaged.name],
      targetRoot,
      force: false,
    });
    expect(uninstall.preview).toStrictEqual({
      success: true,
      changes: [
        {
          name: "alpha",
          action: "uninstall",
          source: "package://skills/alpha",
          target: path.join(targetRoot, "alpha"),
          fromVersion: "2.0.0",
          toVersion: null,
        },
      ],
    });
    await expect(uninstall.commit()).resolves.toStrictEqual({
      success: true,
      changes: [
        {
          name: "alpha",
          action: "uninstall",
          source: "package://skills/alpha",
          target: path.join(targetRoot, "alpha"),
          fromVersion: "2.0.0",
          toVersion: null,
        },
      ],
    });
  });

  test("returns exact marker and state records", async (): Promise<void> => {
    const targetRoot = await createTarget();
    const packaged = skill();
    await installManaged(targetRoot, packaged);
    const directory = path.join(targetRoot, packaged.name);

    await expect(readManagedMarker(directory)).resolves.toStrictEqual({
      name: "alpha",
      version: "2.0.0",
      contentHash: packaged.contentHash,
    });
    await expect(inspectSkill(packaged, targetRoot)).resolves.toStrictEqual({
      name: "alpha",
      version: "2.0.0",
      target: directory,
      status: "current",
    });
    await expect(inspectSkill(skill("3.0.0"), targetRoot)).resolves.toStrictEqual({
      name: "alpha",
      version: "3.0.0",
      target: directory,
      status: "outdated",
    });
  });
});

describe("self mutation boundaries", (): void => {
  test("returns exact no-update preview without calling install", async (): Promise<void> => {
    const targetRoot = await createTarget();
    const packaged = skill("1.0.0");
    let installs = 0;
    const port: PackageManagerPort = {
      resolve: async (): Promise<{ version: string; skills: readonly ManagedSkill[] }> => ({
        version: "1.0.0",
        skills: [packaged],
      }),
      install: async (): Promise<void> => {
        installs += 1;
      },
      rollback: async (): Promise<void> => undefined,
    };
    const plan = await prepareSelfUpdate("1.0.0", [packaged], port, {
      selector: "latest",
      targetRoot,
    });
    const expected = {
      success: true,
      currentVersion: "1.0.0",
      candidateVersion: "1.0.0",
      updateAvailable: false,
      skillChanges: [],
    };

    expect(plan.preview).toStrictEqual(expected);
    await expect(plan.commit()).resolves.toStrictEqual(expected);
    expect(installs).toBe(0);
  });

  test("returns the exact update preview and commit contract", async (): Promise<void> => {
    const targetRoot = await createTarget();
    const current = skill("1.0.0", "old");
    const candidate = skill("2.0.0", "new");
    await installManaged(targetRoot, current);
    const calls: string[] = [];
    const port: PackageManagerPort = {
      resolve: async (selector, includePrerelease) => {
        calls.push(`resolve:${selector}:${includePrerelease}`);
        return { version: "2.0.0", skills: [candidate] };
      },
      install: async (version): Promise<void> => {
        calls.push(`install:${version}`);
      },
      rollback: async (version): Promise<void> => {
        calls.push(`rollback:${version}`);
      },
    };
    const plan = await prepareSelfUpdate("1.0.0", [current], port, {
      selector: "latest",
      targetRoot,
    });

    expect(plan.preview).toStrictEqual({
      success: true,
      currentVersion: "1.0.0",
      candidateVersion: "2.0.0",
      updateAvailable: true,
      cli: { action: "install", package: "@kxh4892636/nano-flow", version: "2.0.0" },
      skills: {
        success: true,
        changes: [
          {
            name: "alpha",
            action: "update",
            source: "package://skills/alpha",
            target: path.join(targetRoot, "alpha"),
            fromVersion: "1.0.0",
            toVersion: "2.0.0",
          },
        ],
      },
    });
    await expect(plan.commit()).resolves.toStrictEqual({
      success: true,
      version: "2.0.0",
      skills: {
        success: true,
        changes: [
          {
            name: "alpha",
            action: "update",
            source: "package://skills/alpha",
            target: path.join(targetRoot, "alpha"),
            fromVersion: "1.0.0",
            toVersion: "2.0.0",
          },
        ],
      },
    });
    expect(calls).toStrictEqual(["resolve:latest:false", "install:2.0.0"]);
    await expect(readFile(path.join(targetRoot, "alpha", "SKILL.md"), "utf8")).resolves.toBe("new");
  });
});

describe("self mutation boundaries", (): void => {
  test("preserves the update failure as the cause after a successful rollback", async (): Promise<void> => {
    const targetRoot = await createTarget();
    const current = skill("1.0.0", "old");
    const candidate = skill("2.0.0", "new");
    const installError = new Error("install failed");
    const calls: string[] = [];
    const port: PackageManagerPort = {
      resolve: async (): Promise<{ version: string; skills: readonly ManagedSkill[] }> => ({
        version: "2.0.0",
        skills: [candidate],
      }),
      install: async (): Promise<void> => {
        throw installError;
      },
      rollback: async (version): Promise<void> => {
        calls.push(version);
      },
    };
    const plan = await prepareSelfUpdate("1.0.0", [current], port, {
      selector: "next",
      targetRoot,
    });

    await expect(plan.commit()).rejects.toMatchObject({
      message: "Nano Flow update failed and was rolled back to 1.0.0",
      cause: installError,
    });
    expect(calls).toStrictEqual(["1.0.0"]);
  });

  test("reports both update and rollback failures", async (): Promise<void> => {
    const targetRoot = await createTarget();
    const current = skill("1.0.0", "old");
    const candidate = skill("2.0.0", "new");
    const installError = new Error("install failed");
    const rollbackError = new Error("rollback failed");
    const port: PackageManagerPort = {
      resolve: async (): Promise<{ version: string; skills: readonly ManagedSkill[] }> => ({
        version: "2.0.0",
        skills: [candidate],
      }),
      install: async (): Promise<void> => {
        throw installError;
      },
      rollback: async (): Promise<void> => {
        throw rollbackError;
      },
    };
    const plan = await prepareSelfUpdate("1.0.0", [current], port, {
      selector: "latest",
      targetRoot,
    });

    await expect(plan.commit()).rejects.toStrictEqual(
      new AggregateError(
        [installError, rollbackError],
        "Nano Flow update and rollback both failed; requested restoration to 1.0.0",
      ),
    );
  });
});

interface CommandCall {
  readonly arguments_: readonly string[];
  readonly executable: string;
}

interface NpmScript {
  readonly calls: CommandCall[];
  failCommand?: "install" | "pack" | "tar" | "view";
  packOutput: string;
  readonly skills: Readonly<Record<string, Readonly<Record<string, string>>>>;
  temporaryRoot?: string;
  versionOutput: string;
}

const commandFrom = (executable: string, arguments_: readonly string[]): string => {
  if (executable === "tar") return "tar";
  return (
    arguments_.find((argument: string): boolean =>
      ["install", "pack", "view"].includes(argument),
    ) ?? "unknown"
  );
};

const writePackagedSkills = async (
  extractedRoot: string,
  skills: NpmScript["skills"],
): Promise<void> => {
  for (const [skillName, files] of Object.entries(skills)) {
    for (const [relativePath, content] of Object.entries(files)) {
      const target = path.join(extractedRoot, "package", "skills", skillName, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
  }
};

const scriptedExecutor =
  (script: NpmScript): NonNullable<NpmPackageManagerDependencies["executeFile"]> =>
  async (
    executable: string,
    arguments_: readonly string[],
  ): Promise<{ readonly stdout: string }> => {
    script.calls.push({ executable, arguments_ });
    const command = commandFrom(executable, arguments_);
    if (script.failCommand === command) throw new Error(`${command} failed`);
    if (command === "view") return { stdout: script.versionOutput };
    if (command === "pack") {
      const destinationIndex = arguments_.indexOf("--pack-destination") + 1;
      const destination = arguments_[destinationIndex];
      if (destination === undefined) throw new Error("pack destination was not provided");
      script.temporaryRoot = destination;
      return { stdout: script.packOutput };
    }
    if (command === "tar") {
      const destinationIndex = arguments_.indexOf("-C") + 1;
      const destination = arguments_[destinationIndex];
      if (destination === undefined) throw new Error("tar destination was not provided");
      await writePackagedSkills(destination, script.skills);
    }
    return { stdout: "" };
  };

const createScript = (overrides: Partial<NpmScript> = {}): NpmScript => ({
  calls: [],
  versionOutput: JSON.stringify(["1.2.0", "2.0.0-beta.1", "1.10.0"]),
  packOutput: JSON.stringify([{ filename: "nested/nf.tgz" }]),
  skills: {
    "nano-flow-cli": { "SKILL.md": "cli" },
    "nano-flow": { "SKILL.md": "flow", "references/FLOW.md": "protocol" },
  },
  ...overrides,
});

describe("npm package manager adapter", (): void => {
  test("resolves the newest stable package and reconstructs sorted managed skills", async (): Promise<void> => {
    const script = createScript();
    const manager = createNpmPackageManager({
      executeFile: scriptedExecutor(script),
      platform: "linux",
    });

    const result = await manager.resolve("latest", false);

    expect(result).toEqual({
      version: "1.10.0",
      skills: [
        {
          name: "nano-flow",
          version: "1.10.0",
          files: [
            { path: "references/FLOW.md", content: "protocol" },
            { path: "SKILL.md", content: "flow" },
          ],
          contentHash: hashSkillFiles([
            { path: "references/FLOW.md", content: "protocol" },
            { path: "SKILL.md", content: "flow" },
          ]),
        },
        {
          name: "nano-flow-cli",
          version: "1.10.0",
          files: [{ path: "SKILL.md", content: "cli" }],
          contentHash: hashSkillFiles([{ path: "SKILL.md", content: "cli" }]),
        },
      ],
    });
    expect(
      script.calls.map((call: CommandCall): string =>
        commandFrom(call.executable, call.arguments_),
      ),
    ).toEqual(["view", "pack", "tar"]);
    await expect(access(script.temporaryRoot ?? "missing temporary root")).rejects.toThrow();
  });

  test("uses Node's npm CLI on Windows and accepts a single prerelease version", async (): Promise<void> => {
    const script = createScript({ versionOutput: JSON.stringify("2.0.0-beta.1") });
    const executeFile = scriptedExecutor(script);
    const manager = createNpmPackageManager({
      execPath: "C:\\Node\\node.exe",
      executeFile,
      platform: "win32",
    });

    expect((await manager.resolve("next", true)).version).toBe("2.0.0-beta.1");
    expect(script.calls[0]).toEqual({
      executable: "C:\\Node\\node.exe",
      arguments_: [
        "C:\\Node\\node_modules\\npm\\bin\\npm-cli.js",
        "view",
        "@kxh4892636/nano-flow@next",
        "version",
        "--json",
      ],
    });
  });

  test("installs and rolls back through the same global npm contract", async (): Promise<void> => {
    const script = createScript();
    const manager = createNpmPackageManager({
      executeFile: scriptedExecutor(script),
      platform: "linux",
    });

    await manager.install("2.0.0");
    await manager.rollback("1.0.0");

    expect(script.calls).toEqual([
      { executable: "npm", arguments_: ["install", "--global", "@kxh4892636/nano-flow@2.0.0"] },
      { executable: "npm", arguments_: ["install", "--global", "@kxh4892636/nano-flow@1.0.0"] },
    ]);
  });

  test.each([
    [JSON.stringify({ version: "1.0.0" }), "invalid Nano Flow version response"],
    [JSON.stringify(["invalid"]), "invalid Nano Flow version response"],
    [JSON.stringify(["2.0.0-beta.1"]), "No stable Nano Flow version matches latest"],
  ])(
    "rejects unusable npm version output %s",
    async (versionOutput: string, cause: string): Promise<void> => {
      const script = createScript({ versionOutput });
      const manager = createNpmPackageManager({
        executeFile: scriptedExecutor(script),
        platform: "linux",
      });

      await expect(manager.resolve("latest", false)).rejects.toMatchObject({
        message: "Unable to resolve @kxh4892636/nano-flow@latest",
        cause: { message: expect.stringContaining(cause) },
      });
    },
  );

  test.each(["null", "[]", "[{},{}]", "[null]", "[{}]", '[{"filename":1}]'])(
    "rejects invalid npm pack output %s and removes its temporary directory",
    async (packOutput: string): Promise<void> => {
      const script = createScript({ packOutput });
      const manager = createNpmPackageManager({
        executeFile: scriptedExecutor(script),
        platform: "linux",
      });

      await expect(manager.resolve("latest", false)).rejects.toMatchObject({
        message: "Unable to resolve @kxh4892636/nano-flow@latest",
        cause: { message: "npm returned an invalid pack response" },
      });
      await expect(access(script.temporaryRoot ?? "missing temporary root")).rejects.toThrow();
    },
  );

  test.each([
    ["view", "resolve", "Unable to resolve @kxh4892636/nano-flow@latest"],
    ["pack", "resolve", "Unable to resolve @kxh4892636/nano-flow@latest"],
    ["tar", "resolve", "Unable to resolve @kxh4892636/nano-flow@latest"],
    ["install", "install", "Unable to install @kxh4892636/nano-flow@2.0.0"],
    ["install", "rollback", "Unable to restore @kxh4892636/nano-flow@2.0.0"],
  ] as const)(
    "wraps %s failures from %s",
    async (
      failCommand: NonNullable<NpmScript["failCommand"]>,
      operation: "install" | "resolve" | "rollback",
      message: string,
    ): Promise<void> => {
      const script = createScript({ failCommand });
      const manager = createNpmPackageManager({
        executeFile: scriptedExecutor(script),
        platform: "linux",
      });

      const execution =
        operation === "resolve" ? manager.resolve("latest", false) : manager[operation]("2.0.0");
      await expect(execution).rejects.toMatchObject({
        message,
        cause: { message: `${failCommand} failed` },
      });
    },
  );
});
