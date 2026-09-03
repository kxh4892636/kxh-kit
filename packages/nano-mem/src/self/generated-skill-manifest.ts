import type { SkillManifest } from "./managed-skill.js";

export const nanoMemSkillManifest = {
  files: [
    {
      path: "SKILL.md",
      sha256: "d6ffde2406015019abb70c4839a6f8fdff9b528bc84790344fd323f53e653b09",
    },
  ],
  packageVersion: "0.0.1",
  skillName: "nano-mem",
  treeHash: "bf6b37561a7ef769c1190fc40615e717f474ffd184d8c11fa623a45e953ae011",
} as const satisfies SkillManifest;
