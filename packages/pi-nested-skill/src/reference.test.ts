import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  expandSkillReferences,
  findDollarReferences,
  loadSkillReference,
  skillBlock,
  type SkillReference,
} from "./reference.ts";

const created: string[] = [];

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-ns-ref-"));
  created.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const reference = (name: string): SkillReference => ({
  name,
  filePath: `/skills/${name}/SKILL.md`,
  baseDir: `/skills/${name}`,
  body: `# ${name}`,
});

describe("findDollarReferences", () => {
  it("matches tokens at the start or after whitespace", () => {
    expect(findDollarReferences("$alpha and $beta-gamma").map((ref) => ref.name)).toEqual([
      "alpha",
      "beta-gamma",
    ]);
  });

  it("ignores uppercase, non-boundary, and suffixed tokens", () => {
    expect(findDollarReferences("$HOME")).toEqual([]);
    expect(findDollarReferences("cost$5")).toEqual([]);
    expect(findDollarReferences("$foo:bar $foo/bar $foo.bar")).toEqual([]);
  });
});

describe("expandSkillReferences", () => {
  it("expands every known reference and preserves surrounding text", () => {
    const result = expandSkillReferences("a $alpha b $beta c", (name) =>
      name === "alpha" || name === "beta" ? reference(name) : undefined,
    );
    expect(result.expanded).toEqual(["alpha", "beta"]);
    expect(result.unknown).toEqual([]);
    expect(result.text).toBe(
      `a ${skillBlock(reference("alpha"))} b ${skillBlock(reference("beta"))} c`,
    );
  });

  it("keeps unknown references verbatim", () => {
    const result = expandSkillReferences("use $alpha and $missing", (name) =>
      name === "alpha" ? reference(name) : undefined,
    );
    expect(result.text).toContain("$missing");
    expect(result.unknown).toEqual(["missing"]);
  });

  it("is a no-op when there are no tokens", () => {
    const result = expandSkillReferences("plain text", () => undefined);
    expect(result).toEqual({ text: "plain text", expanded: [], unknown: [] });
  });
});

describe("skillBlock", () => {
  it("uses the host-compatible shape with the base directory", () => {
    expect(skillBlock(reference("alpha"))).toContain('name="alpha"');
    expect(skillBlock(reference("alpha"))).toContain("References are relative to /skills/alpha.");
  });
});

describe("loadSkillReference", () => {
  it("strips frontmatter and records the base directory", () => {
    const dir = join(tempDir(), "alpha");
    const filePath = join(dir, "SKILL.md");
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, "---\nname: alpha\ndescription: d\n---\n\n# Alpha\n\nbody\n");
    const loaded = loadSkillReference("alpha", filePath);
    expect(loaded.body).toBe("# Alpha\n\nbody");
    expect(loaded.baseDir).toBe(dir);
  });
});
