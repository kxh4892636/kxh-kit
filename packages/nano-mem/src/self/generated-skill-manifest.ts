import type { SkillManifest } from "./managed-skill.js";

export const nanoMemSkillManifest = {
  files: [
    {
      path: "SKILL.md",
      sha256: "3c9f0ba86d7a1332fbee9c28a6be20fb09c0ade37ffbb2e827bf002834a92adc",
    },
  ],
  packageVersion: "0.0.1",
  skillName: "nano-mem",
  treeHash: "bdcd0e309cc9ba691f3e036fc19c847209aa995144d99a04d21ba67fa6f540ed",
} as const satisfies SkillManifest;
