import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const skillRoot = join(packageRoot, "skills", "nano-mem");
const outputPath = join(packageRoot, "src", "self", "generated-skill-manifest.ts");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

const files = readdirSync(skillRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const absolutePath = join(entry.parentPath, entry.name);
    const path = relative(skillRoot, absolutePath).replaceAll("\\", "/");
    const sha256 = createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
    return { path, sha256 };
  })
  .sort((left, right) => left.path.localeCompare(right.path));

const treeHash = createHash("sha256")
  .update(files.map((file) => `${file.path}\0${file.sha256}\n`).join(""))
  .digest("hex");
const generatedFiles = files
  .map(
    (file) =>
      `    {\n      path: ${JSON.stringify(file.path)},\n      sha256: ${JSON.stringify(file.sha256)},\n    },`,
  )
  .join("\n");
const generated = `import type { SkillManifest } from "./managed-skill.js";\n\nexport const nanoMemSkillManifest = {\n  files: [\n${generatedFiles}\n  ],\n  packageVersion: ${JSON.stringify(packageJson.version)},\n  skillName: "nano-mem",\n  treeHash: ${JSON.stringify(treeHash)},\n} as const satisfies SkillManifest;\n`;

if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== generated) {
    console.error("Generated nano-mem skill manifest is stale.");
    process.exitCode = 1;
  }
} else {
  writeFileSync(outputPath, generated);
}
