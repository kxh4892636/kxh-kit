import { CliError, CliErrorKind } from "../cli-error.js";
import type { ManagedSkillFileSystem } from "./managed-skill.js";
import type { NanoMemPackageExecutor, ResolvedNanoMemPackage } from "./npm-package-executor.js";
import {
  prepareSkillSync,
  type PreparedSkillSync,
  type SkillPackageSource,
} from "./self-update-skill.js";

export interface SelfUpdateRequest {
  dryRun: boolean;
  force: boolean;
  selector?: string;
  target?: string;
}

export interface SelfUpdaterDependencies {
  createId?: () => string;
  current: SkillPackageSource;
  currentVersion: string;
  cwd: string;
  fileSystem?: ManagedSkillFileSystem;
  packageExecutor: NanoMemPackageExecutor;
}

type RecoveryStatus = "failed" | "not_needed" | "restored";

interface RecoveryStep {
  artifactPath?: string;
  error?: string;
  status: RecoveryStatus;
}

interface RecoveryResult {
  cli: RecoveryStep;
  skill: RecoveryStep;
}

interface UpdateExecution {
  candidate: ResolvedNanoMemPackage;
  dependencies: SelfUpdaterDependencies;
  packageChanged: boolean;
  plan: object;
  skill: PreparedSkillSync;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : (JSON.stringify(error) ?? "Unknown error");

const recoveryStep = (status: RecoveryStatus, error?: unknown): RecoveryStep => ({
  ...(error === undefined ? {} : { error: errorMessage(error) }),
  status,
});

const updateError = (stage: string, error: unknown, recovery: RecoveryResult): CliError =>
  new CliError(
    recovery.cli.status === "failed" || recovery.skill.status === "failed"
      ? "SELF_UPDATE_ROLLBACK_FAILED"
      : "SELF_UPDATE_FAILED",
    `nano-mem self update failed during ${stage}: ${errorMessage(error)}`,
    CliErrorKind.runtime,
    recovery.cli.status === "failed" || recovery.skill.status === "failed"
      ? "Manual recovery is required; inspect the reported recovery results before retrying."
      : "The previous installation was restored; fix the reported stage and retry.",
    { recovery, stage },
  );

const runUpdateTransaction = async (execution: UpdateExecution): Promise<unknown> => {
  const { candidate, dependencies, packageChanged, plan, skill } = execution;
  let candidateCleaned = false;
  let cliAttempted = false;
  let preservePrevious = false;
  let previous: ResolvedNanoMemPackage | undefined;
  let skillAttempted = false;
  let stage = "cli-backup";
  try {
    if (packageChanged) {
      previous = await dependencies.packageExecutor.captureInstalled(dependencies.currentVersion);
      stage = "cli-install";
      cliAttempted = true;
      await dependencies.packageExecutor.install(candidate);
      stage = "cli-post-check";
      await dependencies.packageExecutor.verifyInstalled(candidate.version);
    }
    if (skill.planned) {
      stage = "skill-sync";
      skillAttempted = true;
      skill.apply();
    }
    stage = "skill-post-check";
    skill.verify();
    stage = "candidate-cleanup";
    candidate.cleanup();
    candidateCleaned = true;
    stage = "skill-finalize";
    skill.finalize();
    return { ...plan, changed: true, dryRun: false };
  } catch (error) {
    const recovery: RecoveryResult = {
      cli: recoveryStep("not_needed"),
      skill: recoveryStep("not_needed"),
    };
    if (skillAttempted) {
      try {
        skill.rollback();
        recovery.skill = recoveryStep("restored");
      } catch (rollbackError) {
        recovery.skill = recoveryStep("failed", rollbackError);
      }
    }
    if (cliAttempted) {
      try {
        if (previous === undefined) throw new Error("The retained CLI artifact is missing.");
        await dependencies.packageExecutor.install(previous);
        await dependencies.packageExecutor.verifyInstalled(dependencies.currentVersion);
        recovery.cli = recoveryStep("restored");
      } catch (rollbackError) {
        preservePrevious = previous !== undefined;
        recovery.cli = {
          ...recoveryStep("failed", rollbackError),
          ...(previous === undefined ? {} : { artifactPath: previous.archivePath }),
        };
      }
    }
    throw updateError(stage, error, recovery);
  } finally {
    if (!candidateCleaned) {
      try {
        candidate.cleanup();
      } catch {
        // 主事务错误及恢复结果优先；临时下载目录由操作系统后续清理。
      }
    }
    if (!preservePrevious) {
      try {
        previous?.cleanup();
      } catch {
        // 已保留的恢复包只在事务期间有用，清理失败不改变已验证的最终安装。
      }
    }
  }
};

export const executeSelfUpdate = async (
  dependencies: SelfUpdaterDependencies,
  request: SelfUpdateRequest,
): Promise<unknown> => {
  let candidate: ResolvedNanoMemPackage;
  if (request.selector === dependencies.currentVersion) {
    candidate = {
      archivePath: "",
      cleanup: (): void => undefined,
      ...dependencies.current,
      version: dependencies.currentVersion,
    };
  } else {
    try {
      candidate = await dependencies.packageExecutor.resolve(request.selector);
    } catch (error) {
      throw updateError("resolve", error, {
        cli: recoveryStep("not_needed"),
        skill: recoveryStep("not_needed"),
      });
    }
  }
  let cleaned = false;
  try {
    const skill = prepareSkillSync(
      {
        current: dependencies.current,
        cwd: dependencies.cwd,
        ...(dependencies.createId === undefined ? {} : { createId: dependencies.createId }),
        ...(dependencies.fileSystem === undefined ? {} : { fileSystem: dependencies.fileSystem }),
      },
      candidate,
      request.target,
      request.force,
    );
    const packageChanged = candidate.version !== dependencies.currentVersion;
    const plan = {
      candidateVersion: candidate.version,
      cli: {
        action: packageChanged ? "update" : "none",
        fromVersion: dependencies.currentVersion,
        package: "@kxh4892636/nano-mem",
        toVersion: candidate.version,
      },
      currentVersion: dependencies.currentVersion,
      dryRun: request.dryRun,
      skill: {
        action: skill.planned ? "update" : "none",
        before: skill.before,
        force: request.force,
        target: skill.target,
      },
    } as const;
    if (request.dryRun || (!packageChanged && !skill.planned)) {
      candidate.cleanup();
      cleaned = true;
      return { ...plan, changed: false };
    }

    cleaned = true;
    return runUpdateTransaction({ candidate, dependencies, packageChanged, plan, skill });
  } finally {
    if (!cleaned) {
      try {
        candidate.cleanup();
      } catch {
        // 主事务错误及恢复结果优先；临时下载目录由操作系统后续清理。
      }
    }
  }
};
