import type { JsonValue, PreparedMutation } from "../../cli/types";
import type { ManagedSkill } from "./skill-catalog";
import { inspectSkill } from "./skill-state";
import { prepareSkillChange } from "./skill-store";
import type { SkillStoreDependencies } from "./skill-store";

export interface ResolvedNanoFlowPackage {
  readonly version: string;
  readonly skills: readonly ManagedSkill[];
}

export interface PackageManagerPort {
  resolve(selector: string, includePrerelease: boolean): Promise<ResolvedNanoFlowPackage>;
  install(version: string): Promise<void>;
  rollback(version: string): Promise<void>;
}

export interface SelfUpdateRequest {
  readonly selector: string;
  readonly targetRoot: string;
}

export const prepareSelfUpdate = async (
  currentVersion: string,
  currentCatalog: readonly ManagedSkill[],
  port: PackageManagerPort,
  request: SelfUpdateRequest,
  skillDependencies: SkillStoreDependencies = {},
): Promise<PreparedMutation> => {
  const candidate = await port.resolve(request.selector, request.selector !== "latest");
  if (candidate.version === currentVersion) {
    const preview: JsonValue = {
      success: true,
      currentVersion,
      candidateVersion: candidate.version,
      updateAvailable: false,
      skillChanges: [],
    };
    return { preview, commit: async (): Promise<JsonValue> => preview };
  }
  const installedNames: string[] = [];
  for (const skill of currentCatalog) {
    if ((await inspectSkill(skill, request.targetRoot)).status !== "not_installed") {
      installedNames.push(skill.name);
    }
  }
  const skillPlan = await prepareSkillChange(
    candidate.skills,
    {
      kind: "update",
      names: installedNames,
      targetRoot: request.targetRoot,
      force: false,
    },
    skillDependencies,
  );
  const preview: JsonValue = {
    success: true,
    currentVersion,
    candidateVersion: candidate.version,
    updateAvailable: true,
    cli: { action: "install", package: "@kxh4892636/nano-flow", version: candidate.version },
    skills: skillPlan.preview,
  };
  return {
    preview,
    commit: async (): Promise<JsonValue> => {
      try {
        await port.install(candidate.version);
        const skills = await skillPlan.commit();
        return { success: true, version: candidate.version, skills };
      } catch (error) {
        try {
          await port.rollback(currentVersion);
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            `Nano Flow update and rollback both failed; requested restoration to ${currentVersion}`,
          );
        }
        throw new Error(`Nano Flow update failed and was rolled back to ${currentVersion}`, {
          cause: error,
        });
      }
    },
  };
};
