import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliUsageError } from "../../cli/errors";
import type { JsonValue } from "../../cli/types";
import type { ManagedSkill, SkillState } from "./skill-catalog";
import { hashSkillFiles, managedMarkerName, readSkillFiles } from "./skill-files";
import { inspectSkill, readManagedMarker } from "./skill-state";

export type SkillChangeKind = "install" | "uninstall" | "update";

export interface SkillChangeRequest {
  readonly kind: SkillChangeKind;
  readonly names: readonly string[];
  readonly targetRoot: string;
  readonly force: boolean;
}

export interface SkillChangePlan {
  readonly preview: JsonValue;
  commit(): Promise<JsonValue>;
}

export interface SkillStoreDependencies {
  beforeReplace?(name: string): Promise<void>;
}

interface PlannedChange {
  readonly action: SkillChangeKind;
  readonly skill: ManagedSkill;
  readonly state: SkillState;
  readonly managed: boolean;
  readonly installedVersion: null | string;
}

interface AppliedChange {
  readonly change: PlannedChange;
  backupMoved: boolean;
  targetInstalled: boolean;
}

const writeSkillTree = async (directory: string, skill: ManagedSkill): Promise<void> => {
  for (const file of skill.files) {
    const destination = path.join(directory, ...file.path.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content, "utf8");
  }
  await writeFile(
    path.join(directory, managedMarkerName),
    JSON.stringify({ name: skill.name, version: skill.version, contentHash: skill.contentHash }),
    "utf8",
  );
};

const validateChange = (change: PlannedChange, force: boolean): void => {
  const { action, managed, state } = change;
  if (action === "install") return;
  if (action === "update" && (state.status === "current" || state.status === "outdated")) return;
  if (action === "uninstall" && state.status !== "not_installed" && managed) {
    if (state.status !== "modified" || force) return;
  }
  if (state.status === "modified" && managed && force) return;
  if (state.status === "modified" && !managed) {
    throw new Error(`Refusing to replace unmanaged skill directory: ${state.target}`);
  }
  if (state.status === "modified")
    throw new Error(`Managed skill has local changes: ${state.target}`);
  if (state.status === "not_installed")
    throw new Error(`Managed skill is not installed: ${state.name}`);
  throw new Error(`Managed skill is already installed: ${state.name}`);
};

const changePreview = (change: PlannedChange): JsonValue => ({
  name: change.skill.name,
  action: change.action,
  source: `package://skills/${change.skill.name}`,
  target: change.state.target,
  fromVersion: change.installedVersion,
  toVersion: change.action === "uninstall" ? null : change.skill.version,
});

const commitChanges = async (
  changes: readonly PlannedChange[],
  targetRoot: string,
  dependencies: SkillStoreDependencies,
): Promise<JsonValue> => {
  await mkdir(targetRoot, { recursive: true });
  const transaction = path.join(targetRoot, `.loopx-transaction-${randomUUID()}`);
  const stagedRoot = path.join(transaction, "staged");
  const backupRoot = path.join(transaction, "backup");
  await mkdir(stagedRoot, { recursive: true });
  const appliedChanges: AppliedChange[] = [];
  try {
    for (const change of changes) {
      if (change.action !== "uninstall") {
        const staged = path.join(stagedRoot, change.skill.name);
        await writeSkillTree(staged, change.skill);
        if (hashSkillFiles(await readSkillFiles(staged)) !== change.skill.contentHash) {
          throw new Error(`Staged skill failed validation: ${change.skill.name}`);
        }
      }
    }
    for (const change of changes) {
      const applied: AppliedChange = { change, backupMoved: false, targetInstalled: false };
      appliedChanges.push(applied);
      if (change.state.status !== "not_installed") {
        await mkdir(backupRoot, { recursive: true });
        await rename(change.state.target, path.join(backupRoot, change.skill.name));
        applied.backupMoved = true;
      }
      await dependencies.beforeReplace?.(change.skill.name);
      if (change.action !== "uninstall") {
        await rename(path.join(stagedRoot, change.skill.name), change.state.target);
        applied.targetInstalled = true;
      }
    }
  } catch (error) {
    for (const applied of [...appliedChanges].reverse()) {
      if (applied.targetInstalled) {
        await rm(applied.change.state.target, { force: true, recursive: true });
      }
      if (applied.backupMoved) {
        const backup = path.join(backupRoot, applied.change.skill.name);
        await rename(backup, applied.change.state.target);
      }
    }
    throw new Error("Managed skill transaction failed and was rolled back", { cause: error });
  } finally {
    await rm(transaction, { force: true, recursive: true });
  }
  return { success: true, changes: changes.map(changePreview) };
};

export const prepareSkillChange = async (
  catalog: readonly ManagedSkill[],
  request: SkillChangeRequest,
  dependencies: SkillStoreDependencies = {},
): Promise<SkillChangePlan> => {
  const changes: PlannedChange[] = [];
  for (const name of request.names) {
    const skill = catalog.find((candidate: ManagedSkill): boolean => candidate.name === name);
    if (skill === undefined) throw new CliUsageError(`Unknown managed skill: ${name}`);
    const state = await inspectSkill(skill, request.targetRoot);
    const marker = await readManagedMarker(state.target);
    const change = {
      action: request.kind,
      skill,
      state,
      managed: marker?.name === skill.name,
      installedVersion: marker?.version ?? null,
    };
    validateChange(change, request.force);
    changes.push(change);
  }
  const preview: JsonValue = { success: true, changes: changes.map(changePreview) };
  return {
    preview,
    commit: async (): Promise<JsonValue> =>
      commitChanges(changes, request.targetRoot, dependencies),
  };
};
