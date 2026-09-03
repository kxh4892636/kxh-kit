import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadSkills, type Skill } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { discoverNestedSkillPaths } from "./discovery.ts";

const cleanupPaths: string[] = [];

const writeSkill = async (path: string, name: string, description = name): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8",
  );
};

afterEach(async (): Promise<void> => {
  await Promise.all(
    cleanupPaths
      .splice(0)
      .map((path: string): Promise<void> => rm(path, { recursive: true, force: true })),
  );
});

describe("nested skill discovery", (): void => {
  it("preserves parent precedence, sorts descendants, and removes canonical duplicates", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "pi-nested-order-"));
    cleanupPaths.push(root);
    const firstParent = join(root, "first", "SKILL.md");
    const secondParent = join(root, "second", "SKILL.md");
    const firstChild = join(root, "first", "z", "SKILL.md");
    const secondA = join(root, "second", "a", "SKILL.md");
    const secondZ = join(root, "second", "z", "SKILL.md");
    await writeSkill(firstParent, "first");
    await writeSkill(secondParent, "second");
    await writeSkill(firstChild, "first-child");
    await writeSkill(secondZ, "second-z");
    await writeSkill(secondA, "second-a");
    const secondAliasRoot = join(root, "second-alias");
    await symlink(join(root, "second"), secondAliasRoot, "junction");
    const secondAliasParent = join(secondAliasRoot, "SKILL.md");

    const nativePaths = [secondParent, firstParent, secondAliasParent, secondA];
    const expected = [secondZ, firstChild];
    await expect(discoverNestedSkillPaths(nativePaths)).resolves.toEqual(expected);
    await expect(discoverNestedSkillPaths(nativePaths)).resolves.toEqual(expected);
  });

  it("honors Pi ignore files and skips hidden, dependency, and linked directories", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "pi-nested-ignore-"));
    const outside = await mkdtemp(join(tmpdir(), "pi-nested-outside-"));
    cleanupPaths.push(root, outside);
    const parent = join(root, "parent", "SKILL.md");
    const kept = join(root, "parent", "kept", "SKILL.md");
    await writeSkill(parent, "parent");
    await writeSkill(kept, "kept");
    await writeSkill(join(root, "parent", "ignored-git", "SKILL.md"), "ignored-git");
    await writeSkill(join(root, "parent", "nested", "ignored-local", "SKILL.md"), "ignored-local");
    await writeSkill(join(root, "parent", "ignored-fd", "SKILL.md"), "ignored-fd");
    await writeSkill(join(root, "parent", ".hidden", "SKILL.md"), "hidden");
    await writeSkill(join(root, "parent", "node_modules", "pkg", "SKILL.md"), "dependency");
    await writeFile(join(root, "parent", ".gitignore"), "ignored-git/\n", "utf8");
    await mkdir(join(root, "parent", "nested"), { recursive: true });
    await writeFile(join(root, "parent", "nested", ".ignore"), "ignored-local/\n", "utf8");
    await writeFile(join(root, "parent", ".fdignore"), "ignored-fd/\n", "utf8");
    await writeSkill(join(outside, "SKILL.md"), "outside");
    await symlink(outside, join(root, "parent", "linked"), "junction");

    await expect(discoverNestedSkillPaths([parent])).resolves.toEqual([kept]);
  });

  it("keeps the native declaration when a nested skill has the same name", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "pi-nested-collision-"));
    cleanupPaths.push(root);
    const nativeSkill = join(root, "parent", "SKILL.md");
    const firstNestedSkill = join(root, "parent", "a", "duplicate", "SKILL.md");
    const secondNestedSkill = join(root, "parent", "references", "duplicate", "SKILL.md");
    await writeSkill(nativeSkill, "duplicate", "native declaration");
    await writeSkill(firstNestedSkill, "duplicate", "first nested declaration");
    await writeSkill(secondNestedSkill, "duplicate", "second nested declaration");
    const discovered = await discoverNestedSkillPaths([nativeSkill]);
    const result = loadSkills({
      agentDir: join(root, "agent"),
      cwd: root,
      includeDefaults: false,
      skillPaths: [nativeSkill, ...discovered],
    });

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]?.description).toBe("native declaration");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "collision", path: firstNestedSkill }),
        expect.objectContaining({ type: "collision", path: secondNestedSkill }),
      ]),
    );
  });

  it("uses sorted path precedence when nested declarations share a name", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "pi-nested-precedence-"));
    cleanupPaths.push(root);
    const nativeSkill = join(root, "parent", "SKILL.md");
    const firstNestedSkill = join(root, "parent", "a", "SKILL.md");
    const secondNestedSkill = join(root, "parent", "z", "SKILL.md");
    await writeSkill(nativeSkill, "parent");
    await writeSkill(firstNestedSkill, "duplicate", "first nested declaration");
    await writeSkill(secondNestedSkill, "duplicate", "second nested declaration");
    const discovered = await discoverNestedSkillPaths([nativeSkill]);
    const result = loadSkills({
      agentDir: join(root, "agent"),
      cwd: root,
      includeDefaults: false,
      skillPaths: [nativeSkill, ...discovered],
    });

    expect(
      result.skills.find((skill: Skill): boolean => skill.name === "duplicate")?.description,
    ).toBe("first nested declaration");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "collision", path: secondNestedSkill }),
      ]),
    );
  });

  it("returns an empty result when a native skill root disappears or is not a directory", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "pi-nested-invalid-root-"));
    cleanupPaths.push(root);
    const nonDirectoryRoot = join(root, "not-a-directory");
    await writeFile(nonDirectoryRoot, "file", "utf8");

    await expect(
      discoverNestedSkillPaths([
        join(root, "missing", "SKILL.md"),
        join(nonDirectoryRoot, "SKILL.md"),
      ]),
    ).resolves.toEqual([]);
  });
});
