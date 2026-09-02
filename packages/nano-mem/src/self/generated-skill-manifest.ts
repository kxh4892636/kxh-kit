import type { SkillManifest } from "./managed-skill.js";

export const nanoMemSkillManifest = {
  files: [
    {
      path: "SKILL.md",
      sha256: "865e3c59e88b62d09e1643a0a86ef5709bc4dba86fe866212f5d9a20984e89f1",
    },
  ],
  packageVersion: "0.0.1",
  skillName: "nano-mem",
  treeHash: "72789dcfe1c8557e47fb600e973b083966de6f64a31f4b80d58abdaee997b90f",
} as const satisfies SkillManifest;
