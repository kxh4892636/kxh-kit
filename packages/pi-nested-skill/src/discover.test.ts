import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative as relativePath } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findHiddenSkillDirs, skillRoots } from "./discover.ts";

const created: string[] = [];

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-ns-"));
  created.push(dir);
  return dir;
};

const writeSkill = (dir: string, name: string): void => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill\n---\n\nbody\n`,
  );
};

const relativeTo = (paths: readonly string[], base: string): string[] => {
  const canonicalBase = realpathSync(base);
  return paths
    .map((path) => relativePath(canonicalBase, path).replaceAll("\\", "/"))
    .sort((left, right) => left.localeCompare(right));
};

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Build a project with one visible skill and several nested/hidden ones. */
const buildProject = (): string => {
  const project = tempDir();
  mkdirSync(join(project, ".git"), { recursive: true });
  writeSkill(join(project, ".agents/skills/alpha"), "alpha");
  writeSkill(join(project, ".agents/skills/alpha/references/skills/beta"), "beta");
  writeSkill(join(project, ".agents/skills/alpha/references/skills/beta/deeper"), "deeper");
  writeSkill(join(project, ".agents/skills/gamma/group/delta"), "delta");
  writeSkill(join(project, ".agents/skills/node_modules/pkg"), "pkg");
  writeSkill(join(project, ".agents/skills/alpha/.hidden/secret"), "secret");
  return project;
};

describe("skillRoots", () => {
  it("includes agent, home, and (trusted) project roots", () => {
    const project = buildProject();
    const agentDir = tempDir();
    mkdirSync(join(agentDir, "skills"), { recursive: true });
    const homeDir = tempDir();
    mkdirSync(join(homeDir, ".agents", "skills"), { recursive: true });
    const roots = skillRoots({ cwd: project, agentDir, homeDir, projectTrusted: true });
    expect(roots).toContain(join(realpathSync(agentDir), "skills"));
    expect(roots).toContain(join(realpathSync(homeDir), ".agents", "skills"));
    expect(roots.some((root) => root.endsWith(join(".agents", "skills")))).toBe(true);
  });

  it("omits project roots for untrusted projects", () => {
    const project = buildProject();
    const agentDir = tempDir();
    mkdirSync(join(agentDir, "skills"), { recursive: true });
    const roots = skillRoots({ cwd: project, agentDir, homeDir: tempDir(), projectTrusted: false });
    expect(roots).toEqual([join(realpathSync(agentDir), "skills")]);
  });
});

describe("findHiddenSkillDirs", () => {
  it("returns only skills below another SKILL.md, pruning noise", () => {
    const project = buildProject();
    const result = findHiddenSkillDirs({
      cwd: project,
      agentDir: tempDir(),
      homeDir: tempDir(),
      projectTrusted: true,
    });
    expect(relativeTo(result, project)).toEqual([
      ".agents/skills/alpha/references/skills/beta",
      ".agents/skills/alpha/references/skills/beta/deeper",
    ]);
  });

  it("finds the same nested skills below a known skill directory", () => {
    const project = buildProject();
    const result = findHiddenSkillDirs({
      cwd: tempDir(),
      agentDir: tempDir(),
      homeDir: tempDir(),
      projectTrusted: false,
      knownSkillDirs: [join(project, ".agents/skills/alpha")],
    });
    expect(relativeTo(result, project)).toEqual([
      ".agents/skills/alpha/references/skills/beta",
      ".agents/skills/alpha/references/skills/beta/deeper",
    ]);
  });

  it("returns nothing when no root exists", () => {
    expect(
      findHiddenSkillDirs({
        cwd: tempDir(),
        agentDir: tempDir(),
        homeDir: tempDir(),
        projectTrusted: true,
      }),
    ).toEqual([]);
  });
});
