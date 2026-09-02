import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { expandSkillMarkers, type SkillReadWarning } from "./expansion.ts";

const cleanupPaths: string[] = [];

const writeSkill = async (path: string, name: string, body: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `---\nname: ${name}\ndescription: ${name}\n---\n\n${body}\n`, "utf8");
};

const skillBlock = (name: string, path: string, body: string): string =>
  `<skill name="${name}" location="${path}">\nReferences are relative to ${dirname(path)}.\n\n${body}\n</skill>`;

afterEach(async (): Promise<void> => {
  await Promise.all(
    cleanupPaths
      .splice(0)
      .map((path: string): Promise<void> => rm(path, { recursive: true, force: true })),
  );
});

describe("skill marker expansion", (): void => {
  it("expands different and repeated markers in place without scanning inserted bodies", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "pi-skill-expansion-"));
    cleanupPaths.push(root);
    const alphaPath = join(root, "alpha", "SKILL.md");
    const betaPath = join(root, "nested", "beta", "SKILL.md");
    await writeSkill(alphaPath, "alpha", "Alpha says /skill:beta.");
    await writeSkill(betaPath, "beta", "Beta body.");
    const catalog = new Map([
      ["alpha", alphaPath],
      ["beta", betaPath],
    ]);
    const input =
      "/skill:alpha start\nmid `/skill:beta`\n```text\n/skill:beta\n```\nend /skill:alpha.";

    await expect(expandSkillMarkers(input, catalog, (): void => undefined)).resolves.toEqual({
      changed: true,
      text: `${skillBlock("alpha", alphaPath, "Alpha says /skill:beta.")} start\nmid \`${skillBlock("beta", betaPath, "Beta body.")}\`\n\`\`\`text\n${skillBlock("beta", betaPath, "Beta body.")}\n\`\`\`\nend ${skillBlock("alpha", alphaPath, "Alpha says /skill:beta.")}.`,
    });
  });

  it("keeps escaped, unknown, and non-independent markers literal", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "pi-skill-boundary-"));
    cleanupPaths.push(root);
    const alphaPath = join(root, "alpha", "SKILL.md");
    await writeSkill(alphaPath, "alpha", "Alpha body.");
    const input = String.raw`\/skill:alpha /skill:missing https://example.test/skill:alpha https://x/#/skill:alpha dir/skill:alpha ./skill:alpha ~/skill:alpha C:/skill:alpha file:/skill:alpha ?next=/skill:alpha x/skill:alpha 𐐀/skill:alpha é/skill:alpha /skill:alpha-more /skill:alpha/path /skill:alpha\path /skill:alpha_more /skill:alpha中文 /skill:alpha𐐀 /skill:alphá`;

    await expect(
      expandSkillMarkers(input, new Map([["alpha", alphaPath]]), (): void => undefined),
    ).resolves.toEqual({
      text: input,
      changed: false,
    });
  });

  it("isolates read failures and continues expanding later occurrences", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "pi-skill-failure-"));
    cleanupPaths.push(root);
    const goodPath = join(root, "good", "SKILL.md");
    const missingPath = join(root, "missing", "SKILL.md");
    await writeSkill(goodPath, "good", "Good body.");
    const warnings: SkillReadWarning[] = [];

    const result = await expandSkillMarkers(
      "before /skill:missing then /skill:good after",
      new Map([
        ["missing", missingPath],
        ["good", goodPath],
      ]),
      (warning: SkillReadWarning): void => {
        warnings.push(warning);
      },
    );

    expect(result).toEqual({
      changed: true,
      text: `before /skill:missing then ${skillBlock("good", goodPath, "Good body.")} after`,
    });
    expect(warnings).toEqual([{ name: "missing", path: missingPath }]);
  });
});
