import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { nanoMemSkillManifest } from "./generated-skill-manifest.js";
import {
  createManagedSkillService,
  nodeManagedSkillFileSystem,
  type ManagedSkillFileSystem,
  type ManagedSkillService,
} from "./managed-skill.js";

interface SkillFixture {
  root: string;
  service: ManagedSkillService;
  skill: string;
}

const temporaryRoots: string[] = [];
const sourceDirectory = fileURLToPath(new URL("../../skills/nano-mem/", import.meta.url));

const createFixture = (fileSystem?: ManagedSkillFileSystem): SkillFixture => {
  const root = mkdtempSync(join(tmpdir(), "nano-mem-managed-skill-"));
  temporaryRoots.push(root);
  const target = join(root, "target");
  return {
    root,
    service: createManagedSkillService({
      createId: (): string => "transaction-id",
      cwd: root,
      manifest: nanoMemSkillManifest,
      sourceDirectory,
      ...(fileSystem === undefined ? {} : { fileSystem }),
    }),
    skill: join(target, "nano-mem"),
  };
};

const targetFor = (fixture: SkillFixture): string => join(fixture.root, "target");
const markerFor = (fixture: SkillFixture): string => join(fixture.skill, ".nano-mem-managed.json");
const skillFileFor = (fixture: SkillFixture): string => join(fixture.skill, "SKILL.md");

const makeOutdated = (fixture: SkillFixture): void => {
  const marker = JSON.parse(readFileSync(markerFor(fixture), "utf8")) as Record<string, unknown>;
  marker["packageVersion"] = "0.0.0";
  writeFileSync(markerFor(fixture), `${JSON.stringify(marker, null, 2)}\n`);
};

afterEach((): void => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("managed skill states and plans", (): void => {
  test("distinguishes not-installed, current, outdated, and modified", (): void => {
    const fixture = createFixture();
    expect(fixture.service.status(targetFor(fixture))).toMatchObject({
      expectedContentHash: nanoMemSkillManifest.treeHash,
      installedVersion: null,
      packageVersion: nanoMemSkillManifest.packageVersion,
      status: "not_installed",
    });
    fixture.service.mutate("install", {
      dryRun: false,
      force: false,
      target: targetFor(fixture),
    });
    expect(fixture.service.status(targetFor(fixture))).toMatchObject({
      installedContentHash: nanoMemSkillManifest.treeHash,
      installedVersion: nanoMemSkillManifest.packageVersion,
      observedContentHash: nanoMemSkillManifest.treeHash,
      status: "current",
    });
    makeOutdated(fixture);
    expect(fixture.service.status(targetFor(fixture)).status).toBe("outdated");
    appendFileSync(skillFileFor(fixture), "\nlocal change\n");
    expect(fixture.service.status(targetFor(fixture)).status).toBe("modified");
  });

  test("plans install, update, and uninstall without writing", (): void => {
    const fixture = createFixture();
    const target = targetFor(fixture);
    expect(fixture.service.mutate("install", { dryRun: true, force: false, target })).toMatchObject(
      {
        after: "current",
        before: "not_installed",
        changed: true,
        dryRun: true,
      },
    );
    expect(nodeManagedSkillFileSystem.exists(target)).toBe(false);
    fixture.service.mutate("install", { dryRun: false, force: false, target });
    makeOutdated(fixture);
    expect(fixture.service.mutate("update", { dryRun: true, force: false, target })).toMatchObject({
      after: "current",
      before: "outdated",
      changed: true,
    });
    expect(fixture.service.status(target).status).toBe("outdated");
    fixture.service.mutate("update", { dryRun: false, force: false, target });
    expect(
      fixture.service.mutate("uninstall", { dryRun: true, force: false, target }),
    ).toMatchObject({ after: "not_installed", before: "current", changed: true });
    expect(fixture.service.status(target).status).toBe("current");
    fixture.service.mutate("uninstall", { dryRun: false, force: false, target });
    expect(fixture.service.status(target).status).toBe("not_installed");
  });
});

describe("managed skill mutation boundaries", (): void => {
  test("protects local modifications unless force targets the exact skill", (): void => {
    const fixture = createFixture();
    const target = targetFor(fixture);
    fixture.service.mutate("install", { dryRun: false, force: false, target });
    appendFileSync(skillFileFor(fixture), "\nlocal change\n");
    const localContent = readFileSync(skillFileFor(fixture), "utf8");
    expect((): void => {
      fixture.service.mutate("update", { dryRun: false, force: false, target });
    }).toThrowError(expect.objectContaining({ code: "SKILL_MODIFIED" }));
    expect((): void => {
      fixture.service.mutate("uninstall", { dryRun: false, force: false, target });
    }).toThrowError(expect.objectContaining({ code: "SKILL_MODIFIED" }));
    expect(readFileSync(skillFileFor(fixture), "utf8")).toBe(localContent);
    const sibling = join(target, "sibling.txt");
    writeFileSync(sibling, "keep");
    fixture.service.mutate("update", { dryRun: false, force: true, target });
    expect(fixture.service.status(target).status).toBe("current");
    expect(readFileSync(sibling, "utf8")).toBe("keep");
  });

  test("force replaces a modified junction without following its target", (): void => {
    const fixture = createFixture();
    const target = targetFor(fixture);
    fixture.service.mutate("install", { dryRun: false, force: false, target });
    rmSync(fixture.skill, { recursive: true });
    const external = join(fixture.root, "external-skill");
    mkdirSync(external);
    const sentinel = join(external, "sentinel.txt");
    writeFileSync(sentinel, "outside");
    symlinkSync(external, fixture.skill, "junction");
    expect(fixture.service.status(target).status).toBe("modified");

    fixture.service.mutate("update", { dryRun: false, force: true, target });

    expect(fixture.service.status(target).status).toBe("current");
    expect(existsSync(sentinel)).toBe(true);
  });
});

describe("managed skill path boundaries", (): void => {
  test("rejects empty, traversing, concrete-skill, and non-directory targets", (): void => {
    const fixture = createFixture();
    const fileTarget = join(fixture.root, "target-file");
    writeFileSync(fileTarget, "not a directory");
    for (const target of ["", "../outside", join(fixture.root, "nano-mem"), fileTarget]) {
      expect((): void => {
        fixture.service.status(target);
      }).toThrowError(expect.objectContaining({ code: "INVALID_SKILL_TARGET" }));
    }
  });

  test("uses cwd/.agents/skills by default without status writes", (): void => {
    const fixture = createFixture();
    const expectedTarget = join(fixture.root, ".agents", "skills", "nano-mem");
    expect(fixture.service.status()).toMatchObject({
      status: "not_installed",
      target: expectedTarget,
    });
    expect(nodeManagedSkillFileSystem.exists(join(fixture.root, ".agents"))).toBe(false);
  });

  test("revalidates canonical targets and does not follow marker symlinks", (): void => {
    const fixture = createFixture();
    const target = targetFor(fixture);
    fixture.service.mutate("install", { dryRun: false, force: false, target });
    const canonicalSkillFileSystem: ManagedSkillFileSystem = {
      ...nodeManagedSkillFileSystem,
      realpath: (): string => join(fixture.root, "nano-mem"),
    };
    const canonicalService = createManagedSkillService({
      cwd: fixture.root,
      fileSystem: canonicalSkillFileSystem,
      manifest: nanoMemSkillManifest,
      sourceDirectory,
    });
    expect((): void => {
      canonicalService.status(target);
    }).toThrowError(expect.objectContaining({ code: "INVALID_SKILL_TARGET" }));
    const markerPath = markerFor(fixture);
    const markerSymlinkFileSystem: ManagedSkillFileSystem = {
      ...nodeManagedSkillFileSystem,
      kind: (path: string): "directory" | "file" | "symlink" =>
        path === markerPath ? "symlink" : nodeManagedSkillFileSystem.kind(path),
      readFile: (path: string): Buffer => {
        if (path === markerPath) throw new Error("marker symlink was followed");
        return nodeManagedSkillFileSystem.readFile(path);
      },
    };
    const markerService = createManagedSkillService({
      cwd: fixture.root,
      fileSystem: markerSymlinkFileSystem,
      manifest: nanoMemSkillManifest,
      sourceDirectory,
    });
    expect(markerService.status(target).status).toBe("modified");
  });
});

describe("managed skill concurrent changes", (): void => {
  test("revalidates the tree captured by rename before overwriting it", (): void => {
    const fixture = createFixture();
    const target = targetFor(fixture);
    fixture.service.mutate("install", { dryRun: false, force: false, target });
    makeOutdated(fixture);
    let changed = false;
    const racingFileSystem: ManagedSkillFileSystem = {
      ...nodeManagedSkillFileSystem,
      rename: (source: string, destination: string): void => {
        if (!changed && source === fixture.skill) {
          changed = true;
          appendFileSync(skillFileFor(fixture), "\nconcurrent local change\n");
        }
        nodeManagedSkillFileSystem.rename(source, destination);
      },
    };
    const service = createManagedSkillService({
      cwd: fixture.root,
      fileSystem: racingFileSystem,
      manifest: nanoMemSkillManifest,
      sourceDirectory,
    });

    expect((): void => {
      service.mutate("update", { dryRun: false, force: false, target });
    }).toThrowError(expect.objectContaining({ code: "SKILL_MODIFIED" }));
    expect(readFileSync(skillFileFor(fixture), "utf8")).toContain("concurrent local change");
    expect(
      nodeManagedSkillFileSystem
        .listFiles(target)
        .some((path: string): boolean => path.includes(".nano-mem.")),
    ).toBe(false);
  });
});

describe("managed skill transaction recovery", (): void => {
  test("restores an outdated installation when promotion fails", (): void => {
    let renameCount = 0;
    const failingFileSystem: ManagedSkillFileSystem = {
      ...nodeManagedSkillFileSystem,
      rename: (source: string, target: string): void => {
        renameCount += 1;
        if (renameCount === 2) throw new Error("promotion failed");
        nodeManagedSkillFileSystem.rename(source, target);
      },
    };
    const fixture = createFixture();
    const target = targetFor(fixture);
    fixture.service.mutate("install", { dryRun: false, force: false, target });
    makeOutdated(fixture);
    const service = createManagedSkillService({
      createId: (): string => "failure-id",
      cwd: fixture.root,
      fileSystem: failingFileSystem,
      manifest: nanoMemSkillManifest,
      sourceDirectory,
    });
    expect((): void => {
      service.mutate("update", { dryRun: false, force: false, target });
    }).toThrowError(expect.objectContaining({ code: "SKILL_WRITE_FAILED" }));
    expect(fixture.service.status(target).status).toBe("outdated");
    expect(nodeManagedSkillFileSystem.listFiles(target)).toEqual([
      "nano-mem/.nano-mem-managed.json",
      "nano-mem/SKILL.md",
    ]);
  });

  test("cleans staging when package copying fails", (): void => {
    const failingFileSystem: ManagedSkillFileSystem = {
      ...nodeManagedSkillFileSystem,
      copyFile: (): never => {
        throw new Error("copy failed");
      },
    };
    const fixture = createFixture(failingFileSystem);
    const target = targetFor(fixture);
    expect((): void => {
      fixture.service.mutate("install", { dryRun: false, force: false, target });
    }).toThrowError(expect.objectContaining({ code: "SKILL_WRITE_FAILED" }));
    expect(fixture.service.status(target).status).toBe("not_installed");
    expect(nodeManagedSkillFileSystem.listFiles(target)).toEqual([]);
  });

  test("preserves the remaining backup when destructive cleanup partially fails", (): void => {
    const fixture = createFixture();
    const target = targetFor(fixture);
    fixture.service.mutate("install", { dryRun: false, force: false, target });
    let removeCount = 0;
    const failingFileSystem: ManagedSkillFileSystem = {
      ...nodeManagedSkillFileSystem,
      remove: (path: string): void => {
        removeCount += 1;
        if (removeCount === 1) {
          nodeManagedSkillFileSystem.remove(join(path, "SKILL.md"));
          throw new Error("remove partially failed");
        }
        nodeManagedSkillFileSystem.remove(path);
      },
    };
    const service = createManagedSkillService({
      createId: (): string => "failure-id",
      cwd: fixture.root,
      fileSystem: failingFileSystem,
      manifest: nanoMemSkillManifest,
      sourceDirectory,
    });
    expect((): void => {
      service.mutate("uninstall", { dryRun: false, force: false, target });
    }).toThrowError(expect.objectContaining({ code: "SKILL_ROLLBACK_FAILED" }));
    expect(fixture.service.status(target).status).toBe("not_installed");
    expect(
      nodeManagedSkillFileSystem
        .listFiles(target)
        .some((path: string): boolean => path.includes(".nano-mem.backup-")),
    ).toBe(true);
  });
});
