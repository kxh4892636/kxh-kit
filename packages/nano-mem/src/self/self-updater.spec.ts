import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  createManagedSkillService,
  nodeManagedSkillFileSystem,
  type ManagedSkillFileSystem,
  type SkillManifest,
} from "./managed-skill.js";
import type { NanoMemPackageExecutor, ResolvedNanoMemPackage } from "./npm-package-executor.js";
import { executeSelfUpdate, type SelfUpdaterDependencies } from "./self-updater.js";

interface Fixture {
  candidate: ResolvedNanoMemPackage;
  current: ResolvedNanoMemPackage;
  dependencies: SelfUpdaterDependencies;
  executor: ScriptedExecutor;
  root: string;
  skillFile: string;
  target: string;
}

interface ScriptedExecutor extends NanoMemPackageExecutor {
  failInstallVersion?: string | undefined;
  failVerifyVersion?: string | undefined;
  installedVersion: string;
  installs: string[];
  selectors: Array<string | undefined>;
}

const roots: string[] = [];
const hash = (content: string): string => createHash("sha256").update(content).digest("hex");

const packageSource = (root: string, version: string, content: string): ResolvedNanoMemPackage => {
  const sourceDirectory = join(root, `source-${version}`);
  const skillFile = join(sourceDirectory, "SKILL.md");
  nodeManagedSkillFileSystem.makeDirectory(sourceDirectory);
  writeFileSync(skillFile, content);
  const fileHash = hash(content);
  const manifest: SkillManifest = {
    files: [{ path: "SKILL.md", sha256: fileHash }],
    packageVersion: version,
    skillName: "nano-mem",
    treeHash: hash(`SKILL.md\0${fileHash}\n`),
  };
  const archivePath = join(root, `nano-mem-${version}.tgz`);
  writeFileSync(archivePath, "package archive");
  return {
    archivePath,
    cleanup: (): void => rmSync(archivePath, { force: true }),
    manifest,
    sourceDirectory,
    version,
  };
};

const scriptedExecutor = (
  candidate: ResolvedNanoMemPackage,
  current: ResolvedNanoMemPackage,
): ScriptedExecutor => {
  const executor: ScriptedExecutor = {
    captureInstalled: async (): Promise<ResolvedNanoMemPackage> => current,
    install: async (artifact: ResolvedNanoMemPackage): Promise<void> => {
      const { version } = artifact;
      executor.installs.push(version);
      if (executor.failInstallVersion === version) throw new Error(`install ${version} failed`);
      executor.installedVersion = version;
    },
    installedVersion: "1.0.0",
    installs: [],
    resolve: async (selector: string | undefined): Promise<ResolvedNanoMemPackage> => {
      executor.selectors.push(selector);
      return candidate;
    },
    selectors: [],
    verifyInstalled: async (version: string): Promise<void> => {
      if (executor.failVerifyVersion === version) throw new Error(`verify ${version} failed`);
      if (executor.installedVersion !== version) throw new Error("wrong installed version");
    },
  };
  return executor;
};

const createFixture = (installSkill: boolean = true): Fixture => {
  const root = mkdtempSync(join(tmpdir(), "nano-mem-self-update-"));
  roots.push(root);
  const current = packageSource(root, "1.0.0", "old skill");
  const candidate = packageSource(root, "2.0.0", "new skill");
  const target = join(root, "skills");
  const executor = scriptedExecutor(candidate, current);
  const dependencies: SelfUpdaterDependencies = {
    createId: (): string => "update-transaction",
    current,
    currentVersion: "1.0.0",
    cwd: root,
    packageExecutor: executor,
  };
  if (installSkill) {
    createManagedSkillService({
      cwd: root,
      manifest: current.manifest,
      sourceDirectory: current.sourceDirectory,
    }).mutate("install", { dryRun: false, force: false, target });
  }
  return {
    candidate,
    current,
    dependencies,
    executor,
    root,
    skillFile: join(target, "nano-mem", "SKILL.md"),
    target,
  };
};

afterEach((): void => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("self update plans and success", (): void => {
  test("dry-run resolves latest without changing CLI or skill", async (): Promise<void> => {
    const fixture = createFixture();
    const result = await executeSelfUpdate(fixture.dependencies, {
      dryRun: true,
      force: false,
      target: fixture.target,
    });
    expect(result).toMatchObject({
      candidateVersion: "2.0.0",
      changed: false,
      cli: { action: "update", fromVersion: "1.0.0", toVersion: "2.0.0" },
      skill: { action: "update", before: "current", force: false },
    });
    expect(fixture.executor.selectors).toEqual([undefined]);
    expect(fixture.executor.installs).toEqual([]);
    expect(readFileSync(fixture.skillFile, "utf8")).toBe("old skill");
  });

  test("updates the CLI and installed skill to the same version", async (): Promise<void> => {
    const fixture = createFixture();
    const result = await executeSelfUpdate(fixture.dependencies, {
      dryRun: false,
      force: false,
      selector: "next",
      target: fixture.target,
    });
    expect(result).toMatchObject({ candidateVersion: "2.0.0", changed: true });
    expect(fixture.executor.selectors).toEqual(["next"]);
    expect(fixture.executor.installedVersion).toBe("2.0.0");
    expect(readFileSync(fixture.skillFile, "utf8")).toBe("new skill");
    expect(nodeManagedSkillFileSystem.listFiles(fixture.target)).toEqual([
      "nano-mem/.nano-mem-managed.json",
      "nano-mem/SKILL.md",
    ]);
  });

  test("does not install a skill that was absent from the target", async (): Promise<void> => {
    const fixture = createFixture(false);
    const result = await executeSelfUpdate(fixture.dependencies, {
      dryRun: false,
      force: false,
      target: fixture.target,
    });
    expect(result).toMatchObject({ changed: true, skill: { action: "none" } });
    expect(fixture.executor.installedVersion).toBe("2.0.0");
    expect(nodeManagedSkillFileSystem.exists(fixture.skillFile)).toBe(false);
  });

  test("dry-runs the locally installed version without registry access", async (): Promise<void> => {
    const fixture = createFixture();
    const result = await executeSelfUpdate(fixture.dependencies, {
      dryRun: true,
      force: false,
      selector: "1.0.0",
      target: fixture.target,
    });
    expect(result).toMatchObject({ changed: false, cli: { action: "none" } });
    expect(fixture.executor.selectors).toEqual([]);
  });
});

describe("self update protection and recovery", (): void => {
  test("rejects a modified skill before changing the package", async (): Promise<void> => {
    const fixture = createFixture();
    appendFileSync(fixture.skillFile, "\nlocal change");
    await expect(
      executeSelfUpdate(fixture.dependencies, {
        dryRun: false,
        force: false,
        target: fixture.target,
      }),
    ).rejects.toMatchObject({ code: "SKILL_MODIFIED" });
    expect(fixture.executor.installs).toEqual([]);
    expect(readFileSync(fixture.skillFile, "utf8")).toContain("local change");
  });

  test.each([
    ["install", "2.0.0", undefined, "cli-install"],
    ["post-check", undefined, "2.0.0", "cli-post-check"],
  ])(
    "restores the old CLI after %s failure",
    async (
      _case: string,
      failedInstall: string | undefined,
      failedVerify: string | undefined,
      stage: string,
    ): Promise<void> => {
      const fixture = createFixture();
      fixture.executor.failInstallVersion = failedInstall;
      fixture.executor.failVerifyVersion = failedVerify;
      await expect(
        executeSelfUpdate(fixture.dependencies, {
          dryRun: false,
          force: false,
          target: fixture.target,
        }),
      ).rejects.toMatchObject({
        details: { recovery: { cli: { status: "restored" } }, stage },
      });
      expect(fixture.executor.installedVersion).toBe("1.0.0");
      expect(readFileSync(fixture.skillFile, "utf8")).toBe("old skill");
    },
  );

  test("restores exact modified skill content after skill post-check failure", async (): Promise<void> => {
    const fixture = createFixture();
    appendFileSync(fixture.skillFile, "\nlocal exact content");
    let lists = 0;
    const fileSystem: ManagedSkillFileSystem = {
      ...nodeManagedSkillFileSystem,
      listFiles: (root: string): readonly string[] => {
        lists += 1;
        if (lists === 6) appendFileSync(join(root, "SKILL.md"), "\npost-check corruption");
        return nodeManagedSkillFileSystem.listFiles(root);
      },
    };
    fixture.dependencies.fileSystem = fileSystem;
    await expect(
      executeSelfUpdate(fixture.dependencies, {
        dryRun: false,
        force: true,
        target: fixture.target,
      }),
    ).rejects.toMatchObject({
      details: {
        recovery: { cli: { status: "restored" }, skill: { status: "restored" } },
        stage: "skill-post-check",
      },
    });
    expect(readFileSync(fixture.skillFile, "utf8")).toBe("old skill\nlocal exact content");
    expect(fixture.executor.installedVersion).toBe("1.0.0");
  });
});

describe("self update rollback reporting", (): void => {
  test("reports rollback failure separately", async (): Promise<void> => {
    const fixture = createFixture();
    fixture.executor.failVerifyVersion = "2.0.0";
    fixture.executor.failInstallVersion = "1.0.0";
    await expect(
      executeSelfUpdate(fixture.dependencies, {
        dryRun: false,
        force: false,
        target: fixture.target,
      }),
    ).rejects.toMatchObject({
      code: "SELF_UPDATE_ROLLBACK_FAILED",
      details: {
        recovery: {
          cli: {
            artifactPath: fixture.current.archivePath,
            error: "install 1.0.0 failed",
            status: "failed",
          },
          skill: { status: "not_needed" },
        },
      },
    });
    expect(existsSync(fixture.current.archivePath)).toBe(true);
  });

  test("preserves a pre-existing transaction collision", async (): Promise<void> => {
    const fixture = createFixture();
    const suffix = hash("update-transaction").slice(0, 16);
    const collisionRoot = join(fixture.target, `.nano-mem.self-update-${suffix}`);
    const sentinel = join(collisionRoot, "sentinel.txt");
    mkdirSync(collisionRoot);
    writeFileSync(sentinel, "do not remove");

    await expect(
      executeSelfUpdate(fixture.dependencies, {
        dryRun: false,
        force: false,
        target: fixture.target,
      }),
    ).rejects.toMatchObject({
      code: "SELF_UPDATE_FAILED",
      details: { recovery: { cli: { status: "restored" } }, stage: "skill-sync" },
    });
    expect(readFileSync(sentinel, "utf8")).toBe("do not remove");
  });
});
