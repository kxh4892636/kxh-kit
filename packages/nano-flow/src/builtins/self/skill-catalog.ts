export interface ManagedSkillFile {
  readonly path: string;
  readonly content: string;
}

export interface ManagedSkill {
  readonly name: string;
  readonly version: string;
  readonly contentHash: string;
  readonly files: readonly ManagedSkillFile[];
}

export type SkillStatus = "current" | "modified" | "not_installed" | "outdated";

export interface SkillState {
  readonly [key: string]: JsonValue;
  readonly name: string;
  readonly version: string;
  readonly target: string;
  readonly status: SkillStatus;
}
import type { JsonValue } from "../../cli/types";
