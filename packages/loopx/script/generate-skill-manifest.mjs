import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashSkillFiles, readSkillFiles } from "../src/builtins/self/skill-files.ts";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(packageRoot, "skills");
const outputPath = path.join(packageRoot, "src", "builtins", "self", "generated-skill-manifest.ts");
const isShippedSkillFile = (file) =>
  !file.path.endsWith(".test.mjs") && !file.path.startsWith("script/testing/");

const generateManifest = async () => {
  const packageMetadata = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  const skillDirectories = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const skills = [];
  for (const directory of skillDirectories) {
    const files = (await readSkillFiles(path.join(skillsRoot, directory.name))).filter(
      isShippedSkillFile,
    );
    if (!files.some((file) => file.path === "SKILL.md")) continue;
    skills.push({
      name: directory.name,
      version: packageMetadata.version,
      contentHash: hashSkillFiles(files),
      files,
    });
  }
  const serializedSkills = JSON.stringify(skills);
  const stringLiteral = `'${serializedSkills.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
  const source = `import type { ManagedSkill } from "./skill-catalog";\n\nexport const generatedSkills = JSON.parse(\n  ${stringLiteral},\n) as readonly ManagedSkill[];\n`;
  await writeFile(outputPath, source, "utf8");
};

try {
  await generateManifest();
} catch (error) {
  console.error("Failed to generate the LoopX skill manifest", error);
  process.exitCode = 1;
}
