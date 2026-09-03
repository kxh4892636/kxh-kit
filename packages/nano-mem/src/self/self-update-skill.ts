import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { CliError, CliErrorKind } from "../cli-error.js";
import {
  createManagedSkillService,
  hashSha256,
  nodeManagedSkillFileSystem,
  type ManagedSkillFileSystem,
  type ManagedSkillService,
  type SkillInstallStatus,
  type SkillManifest,
} from "./managed-skill.js";

export interface SkillPackageSource {
  manifest: SkillManifest;
  sourceDirectory: string;
}

export interface PreparedSkillSync {
  apply: () => void;
  before: SkillInstallStatus;
  finalize: () => void;
  planned: boolean;
  rollback: () => void;
  target: string;
  verify: () => void;
}

interface SkillSyncDependencies {
  createId?: () => string;
  current: SkillPackageSource;
  cwd: string;
  fileSystem?: ManagedSkillFileSystem;
}

interface SkillTransactionPaths {
  backupRoot: string;
  backupSkill: string;
  discardRoot: string;
  discardSkill: string;
}

interface SkillTransactionState {
  captured: boolean;
  finalizeStarted: boolean;
  ownsBackupRoot: boolean;
  ownsDiscardRoot: boolean;
}

const transactionName = (id: string): string => hashSha256(id).slice(0, 16);

const transactionPaths = (root: string, id: string): SkillTransactionPaths => {
  const suffix = transactionName(id);
  const backupRoot = join(root, `.nano-mem.self-update-${suffix}`);
  const discardRoot = join(root, `.nano-mem.self-update-discard-${suffix}`);
  return {
    backupRoot,
    backupSkill: join(backupRoot, "nano-mem"),
    discardRoot,
    discardSkill: join(discardRoot, "nano-mem"),
  };
};

const assertForce = (status: SkillInstallStatus, force: boolean): void => {
  if (status === "modified" && !force) {
    throw new CliError(
      "SKILL_MODIFIED",
      "Refusing to update a locally modified nano-mem skill.",
      CliErrorKind.runtime,
      "Run the command again with --force to include this exact target in the update plan.",
    );
  }
};

const serviceFor = (
  dependencies: SkillSyncDependencies,
  source: SkillPackageSource,
): ManagedSkillService =>
  createManagedSkillService({
    cwd: dependencies.cwd,
    fileSystem: dependencies.fileSystem ?? nodeManagedSkillFileSystem,
    manifest: source.manifest,
    sourceDirectory: source.sourceDirectory,
  });

const rollbackFor =
  (
    fileSystem: ManagedSkillFileSystem,
    initialTarget: string,
    paths: SkillTransactionPaths,
    state: SkillTransactionState,
  ): (() => void) =>
  (): void => {
    if (!state.captured) {
      if (state.ownsBackupRoot && fileSystem.exists(paths.backupRoot)) {
        fileSystem.remove(paths.backupRoot);
      }
      state.ownsBackupRoot = false;
      if (state.ownsDiscardRoot && fileSystem.exists(paths.discardRoot)) {
        throw new Error("A preserved candidate skill still requires manual recovery.");
      }
      return;
    }
    if (state.finalizeStarted) {
      throw new Error("The retained skill backup was partially cleaned and cannot be trusted.");
    }
    if (fileSystem.exists(initialTarget)) {
      if (fileSystem.exists(paths.discardRoot)) {
        throw new Error("The skill rollback discard path is already occupied.");
      }
      fileSystem.makeDirectory(paths.discardRoot);
      state.ownsDiscardRoot = true;
      fileSystem.rename(initialTarget, paths.discardSkill);
    }
    fileSystem.rename(paths.backupSkill, initialTarget);
    if (state.ownsBackupRoot && fileSystem.exists(paths.backupRoot)) {
      fileSystem.remove(paths.backupRoot);
    }
    state.ownsBackupRoot = false;
    state.captured = false;
    if (state.ownsDiscardRoot && fileSystem.exists(paths.discardRoot)) {
      fileSystem.remove(paths.discardRoot);
    }
    state.ownsDiscardRoot = false;
  };

export const prepareSkillSync = (
  dependencies: SkillSyncDependencies,
  candidate: SkillPackageSource,
  targetRoot: string | undefined,
  force: boolean,
): PreparedSkillSync => {
  const fileSystem = dependencies.fileSystem ?? nodeManagedSkillFileSystem;
  const currentService = serviceFor(dependencies, dependencies.current);
  const candidateService = serviceFor(dependencies, candidate);
  const initial = currentService.status(targetRoot);
  assertForce(initial.status, force);
  const root = dirname(initial.target);
  const installed = initial.status !== "not_installed";
  const shouldApply = installed && candidateService.status(root).status !== "current";
  const paths = transactionPaths(root, (dependencies.createId ?? randomUUID)());
  const state: SkillTransactionState = {
    captured: false,
    finalizeStarted: false,
    ownsBackupRoot: false,
    ownsDiscardRoot: false,
  };
  const rollbackCaptured = rollbackFor(fileSystem, initial.target, paths, state);

  return {
    apply: (): void => {
      if (!shouldApply) return;
      if (fileSystem.exists(paths.backupRoot) || fileSystem.exists(paths.discardRoot)) {
        throw new CliError(
          "SELF_UPDATE_COLLISION",
          "A nano-mem self-update transaction path already exists.",
          CliErrorKind.runtime,
        );
      }
      try {
        fileSystem.makeDirectory(paths.backupRoot);
        state.ownsBackupRoot = true;
        fileSystem.rename(initial.target, paths.backupSkill);
        state.captured = true;
        assertForce(currentService.status(paths.backupRoot).status, force);
        candidateService.mutate("install", { dryRun: false, force: false, target: root });
      } catch (error) {
        try {
          rollbackCaptured();
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Skill update preparation rollback failed.",
          );
        }
        throw error;
      }
    },
    before: initial.status,
    finalize: (): void => {
      if (state.captured && fileSystem.exists(paths.backupRoot)) {
        state.finalizeStarted = true;
        fileSystem.remove(paths.backupRoot);
        state.ownsBackupRoot = false;
        state.captured = false;
      }
    },
    planned: shouldApply,
    rollback: rollbackCaptured,
    target: initial.target,
    verify: (): void => {
      const observed = candidateService.status(root).status;
      const expected = installed ? "current" : "not_installed";
      if (observed !== expected) {
        throw new Error(`Expected managed skill status ${expected}, observed ${observed}.`);
      }
    },
  };
};
