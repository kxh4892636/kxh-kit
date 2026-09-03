import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { CliError, CliErrorKind } from "../cli-error.js";
import {
  nodeManagedSkillFileSystem,
  type ManagedSkillFileSystem,
} from "./managed-skill-file-system.js";

export { nodeManagedSkillFileSystem } from "./managed-skill-file-system.js";
export type { ManagedSkillFileSystem } from "./managed-skill-file-system.js";

export interface SkillManifestFile {
  path: string;
  sha256: string;
}

export interface SkillManifest {
  files: readonly SkillManifestFile[];
  packageVersion: string;
  skillName: "nano-mem";
  treeHash: string;
}

export type SkillInstallStatus = "current" | "modified" | "not_installed" | "outdated";

export interface ManagedSkillStatus {
  expectedContentHash: string;
  installedContentHash: string | null;
  installedVersion: string | null;
  observedContentHash: string | null;
  packageVersion: string;
  skill: "nano-mem";
  status: SkillInstallStatus;
  target: string;
}

export type SkillMutation = "install" | "uninstall" | "update";

export interface ManagedSkillMutationResult {
  action: SkillMutation;
  after: SkillInstallStatus;
  before: SkillInstallStatus;
  changed: boolean;
  dryRun: boolean;
  packageVersion: string;
  target: string;
}

export interface ManagedSkillService {
  mutate: (
    action: SkillMutation,
    options: { dryRun: boolean; force: boolean; target?: string },
  ) => ManagedSkillMutationResult;
  status: (target?: string) => ManagedSkillStatus;
}

interface ManagedSkillDependencies {
  createId?: () => string;
  cwd: string;
  fileSystem?: ManagedSkillFileSystem;
  manifest: SkillManifest;
  sourceDirectory: string;
}

type ManagedSkillRuntime = Required<ManagedSkillDependencies>;

const managedMarker = ".nano-mem-managed.json";

interface ManagedMarker extends SkillManifest {
  schemaVersion: 1;
}

interface TargetPaths {
  root: string;
  skill: string;
}

interface InstalledTree {
  files: readonly SkillManifestFile[];
  treeHash: string;
  valid: boolean;
}

export const hashSha256 = (content: Buffer | string): string =>
  createHash("sha256").update(content).digest("hex");

export const hashFileList = (files: readonly SkillManifestFile[]): string =>
  hashSha256(
    files.map((file: SkillManifestFile): string => `${file.path}\0${file.sha256}\n`).join(""),
  );

const safeRelativePath = (path: string): boolean =>
  path !== "" &&
  !isAbsolute(path) &&
  !path.split(/[\\/]/u).some((segment: string): boolean => segment === "..");

const targetPaths = (
  dependencies: ManagedSkillRuntime,
  target: string | undefined,
  createRoot: boolean,
): TargetPaths => {
  if (target !== undefined && target.trim() === "") {
    throw new CliError("INVALID_SKILL_TARGET", "Skill target cannot be empty.", CliErrorKind.usage);
  }
  if (target?.split(/[\\/]/u).includes("..") === true) {
    throw new CliError(
      "INVALID_SKILL_TARGET",
      "Skill target cannot contain parent-directory traversal.",
      CliErrorKind.usage,
    );
  }
  let root = resolve(dependencies.cwd, target ?? join(".agents", "skills"));
  if (basename(root).toLowerCase() === dependencies.manifest.skillName) {
    throw new CliError(
      "INVALID_SKILL_TARGET",
      "Skill target must be the skills root, not the nano-mem skill directory.",
      CliErrorKind.usage,
    );
  }
  const { fileSystem } = dependencies;
  if (fileSystem.exists(root)) {
    if (fileSystem.kind(root) !== "directory") {
      throw new CliError(
        "INVALID_SKILL_TARGET",
        "Skill target root must be a real directory.",
        CliErrorKind.usage,
      );
    }
    root = fileSystem.realpath(root);
  } else if (createRoot) {
    fileSystem.makeDirectory(root);
    root = fileSystem.realpath(root);
  }
  if (basename(root).toLowerCase() === dependencies.manifest.skillName) {
    throw new CliError(
      "INVALID_SKILL_TARGET",
      "Canonical skill target must be the skills root, not the nano-mem skill directory.",
      CliErrorKind.usage,
    );
  }
  const skill = resolve(root, dependencies.manifest.skillName);
  if (relative(root, skill) !== dependencies.manifest.skillName) {
    throw new CliError(
      "INVALID_SKILL_TARGET",
      "Resolved skill path must remain inside the target root.",
      CliErrorKind.usage,
    );
  }
  return { root, skill };
};

const parseMarker = (content: Buffer): ManagedMarker | undefined => {
  try {
    const candidate = JSON.parse(content.toString("utf8")) as Partial<ManagedMarker>;
    if (
      candidate.schemaVersion !== 1 ||
      candidate.skillName !== "nano-mem" ||
      typeof candidate.packageVersion !== "string" ||
      typeof candidate.treeHash !== "string" ||
      !Array.isArray(candidate.files)
    ) {
      return undefined;
    }
    const files = candidate.files as SkillManifestFile[];
    if (
      files.some(
        (file: SkillManifestFile): boolean =>
          typeof file.path !== "string" ||
          typeof file.sha256 !== "string" ||
          !safeRelativePath(file.path),
      )
    ) {
      return undefined;
    }
    return candidate as ManagedMarker;
  } catch {
    return undefined;
  }
};

const inspectTree = (fileSystem: ManagedSkillFileSystem, root: string): InstalledTree => {
  const files: SkillManifestFile[] = [];
  for (const path of fileSystem.listFiles(root)) {
    if (path === managedMarker) continue;
    const absolutePath = join(root, ...path.split("/"));
    if (!safeRelativePath(path) || fileSystem.kind(absolutePath) !== "file") {
      return { files: [], treeHash: "", valid: false };
    }
    files.push({ path, sha256: hashSha256(fileSystem.readFile(absolutePath)) });
  }
  files.sort((left: SkillManifestFile, right: SkillManifestFile): number =>
    left.path.localeCompare(right.path),
  );
  return { files, treeHash: hashFileList(files), valid: true };
};

const sameFiles = (
  left: readonly SkillManifestFile[],
  right: readonly SkillManifestFile[],
): boolean =>
  left.length === right.length &&
  left.every(
    (file: SkillManifestFile, index: number): boolean =>
      file.path === right[index]?.path && file.sha256 === right[index]?.sha256,
  );

const statusAt = (dependencies: ManagedSkillRuntime, paths: TargetPaths): ManagedSkillStatus => {
  const base = {
    expectedContentHash: dependencies.manifest.treeHash,
    packageVersion: dependencies.manifest.packageVersion,
    skill: dependencies.manifest.skillName,
    target: paths.skill,
  } as const;
  if (!dependencies.fileSystem.exists(paths.skill)) {
    return {
      ...base,
      installedContentHash: null,
      installedVersion: null,
      observedContentHash: null,
      status: "not_installed",
    };
  }
  if (dependencies.fileSystem.kind(paths.skill) !== "directory") {
    return {
      ...base,
      installedContentHash: null,
      installedVersion: null,
      observedContentHash: null,
      status: "modified",
    };
  }
  const markerPath = join(paths.skill, managedMarker);
  const marker =
    dependencies.fileSystem.exists(markerPath) &&
    dependencies.fileSystem.kind(markerPath) === "file"
      ? parseMarker(dependencies.fileSystem.readFile(markerPath))
      : undefined;
  const observed = inspectTree(dependencies.fileSystem, paths.skill);
  const intact =
    marker !== undefined &&
    observed.valid &&
    marker.treeHash === observed.treeHash &&
    sameFiles(marker.files, observed.files);
  const status: SkillInstallStatus = !intact
    ? "modified"
    : marker.packageVersion === dependencies.manifest.packageVersion &&
        marker.treeHash === dependencies.manifest.treeHash
      ? "current"
      : "outdated";
  return {
    ...base,
    installedContentHash: marker?.treeHash ?? null,
    installedVersion: marker?.packageVersion ?? null,
    observedContentHash: observed.valid ? observed.treeHash : null,
    status,
  };
};

const assertPackagedSource = (dependencies: ManagedSkillRuntime): void => {
  if (
    !dependencies.fileSystem.exists(dependencies.sourceDirectory) ||
    dependencies.fileSystem.kind(dependencies.sourceDirectory) !== "directory"
  ) {
    throw new CliError(
      "PACKAGED_SKILL_MISSING",
      "The packaged nano-mem skill is missing.",
      CliErrorKind.runtime,
    );
  }
  const observed = inspectTree(dependencies.fileSystem, dependencies.sourceDirectory);
  if (
    !observed.valid ||
    observed.treeHash !== dependencies.manifest.treeHash ||
    !sameFiles(observed.files, dependencies.manifest.files)
  ) {
    throw new CliError(
      "PACKAGED_SKILL_INVALID",
      "The packaged nano-mem skill does not match its build manifest.",
      CliErrorKind.runtime,
    );
  }
};

const markerContent = (manifest: SkillManifest): string =>
  `${JSON.stringify({ ...manifest, schemaVersion: 1 } satisfies ManagedMarker, null, 2)}\n`;

const stageSkill = (dependencies: ManagedSkillRuntime, staging: string): void => {
  dependencies.fileSystem.makeDirectory(staging);
  for (const file of dependencies.manifest.files) {
    if (!safeRelativePath(file.path)) {
      throw new CliError(
        "PACKAGED_SKILL_INVALID",
        "The packaged skill manifest contains an unsafe path.",
        CliErrorKind.runtime,
      );
    }
    const segments = file.path.split("/");
    const target = join(staging, ...segments);
    dependencies.fileSystem.makeDirectory(dirname(target));
    dependencies.fileSystem.copyFile(join(dependencies.sourceDirectory, ...segments), target);
  }
  dependencies.fileSystem.writeFile(
    join(staging, managedMarker),
    markerContent(dependencies.manifest),
  );
};

const transactionError = (
  operation: SkillMutation,
  original: unknown,
  rollbackErrors: readonly unknown[],
): CliError => {
  const originalMessage = original instanceof Error ? original.message : String(original);
  if (rollbackErrors.length > 0) {
    return new CliError(
      "SKILL_ROLLBACK_FAILED",
      `Managed skill ${operation} failed and rollback was incomplete: ${originalMessage}`,
      CliErrorKind.runtime,
    );
  }
  if (original instanceof CliError) return original;
  return new CliError(
    "SKILL_WRITE_FAILED",
    `Managed skill ${operation} failed: ${originalMessage}`,
    CliErrorKind.runtime,
  );
};

const attemptRollback = (operation: () => void, errors: unknown[]): void => {
  try {
    operation();
  } catch (error) {
    errors.push(error);
  }
};

const restoreOriginal = (
  dependencies: ManagedSkillRuntime,
  backup: string,
  target: string,
  errors: unknown[],
): void => {
  if (!dependencies.fileSystem.exists(backup) || dependencies.fileSystem.exists(target)) {
    errors.push(new Error("The original managed skill backup could not be restored."));
    return;
  }
  attemptRollback((): void => dependencies.fileSystem.rename(backup, target), errors);
};

const replaceSkill = (
  dependencies: ManagedSkillRuntime,
  paths: TargetPaths,
  operation: "install" | "update",
  force: boolean,
): void => {
  const suffix = hashSha256(dependencies.createId()).slice(0, 16);
  const staging = join(paths.root, `.nano-mem.staging-${suffix}`);
  const backup = join(paths.root, `.nano-mem.backup-${suffix}`);
  if (dependencies.fileSystem.exists(staging) || dependencies.fileSystem.exists(backup)) {
    throw new CliError(
      "SKILL_TRANSACTION_COLLISION",
      "A managed skill staging path already exists.",
      CliErrorKind.runtime,
    );
  }
  let backupCreated = false;
  let backupRemovalStarted = false;
  let targetPromoted = false;
  try {
    stageSkill(dependencies, staging);
    if (dependencies.fileSystem.exists(paths.skill)) {
      dependencies.fileSystem.rename(paths.skill, backup);
      backupCreated = true;
      assertMutationAllowed(
        operation,
        statusAt(dependencies, { root: paths.root, skill: backup }).status,
        force,
      );
    } else if (operation === "update") {
      assertMutationAllowed(operation, "not_installed", force);
    }
    dependencies.fileSystem.rename(staging, paths.skill);
    targetPromoted = true;
    if (statusAt(dependencies, paths).status !== "current") {
      throw new Error("Promoted skill did not match the package manifest.");
    }
    if (backupCreated) {
      backupRemovalStarted = true;
      dependencies.fileSystem.remove(backup);
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (backupRemovalStarted) {
      rollbackErrors.push(
        new Error("Backup removal started; preserving the remainder for manual recovery."),
      );
    } else {
      if (targetPromoted && dependencies.fileSystem.exists(paths.skill)) {
        attemptRollback((): void => dependencies.fileSystem.remove(paths.skill), rollbackErrors);
      }
      if (backupCreated) restoreOriginal(dependencies, backup, paths.skill, rollbackErrors);
      if (dependencies.fileSystem.exists(staging)) {
        attemptRollback((): void => dependencies.fileSystem.remove(staging), rollbackErrors);
      }
    }
    throw transactionError(operation, error, rollbackErrors);
  }
};

const uninstallSkill = (
  dependencies: ManagedSkillRuntime,
  paths: TargetPaths,
  force: boolean,
): void => {
  const suffix = hashSha256(dependencies.createId()).slice(0, 16);
  const backup = join(paths.root, `.nano-mem.backup-${suffix}`);
  if (dependencies.fileSystem.exists(backup)) {
    throw new CliError(
      "SKILL_TRANSACTION_COLLISION",
      "A managed skill backup path already exists.",
      CliErrorKind.runtime,
    );
  }
  let backupCreated = false;
  let backupRemovalStarted = false;
  try {
    dependencies.fileSystem.rename(paths.skill, backup);
    backupCreated = true;
    assertMutationAllowed(
      "uninstall",
      statusAt(dependencies, { root: paths.root, skill: backup }).status,
      force,
    );
    backupRemovalStarted = true;
    dependencies.fileSystem.remove(backup);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (backupRemovalStarted) {
      rollbackErrors.push(
        new Error("Backup removal started; preserving the remainder for manual recovery."),
      );
    } else if (backupCreated) restoreOriginal(dependencies, backup, paths.skill, rollbackErrors);
    throw transactionError("uninstall", error, rollbackErrors);
  }
};

const assertMutationAllowed = (
  action: SkillMutation,
  status: SkillInstallStatus,
  force: boolean,
): void => {
  if (status === "modified" && !force) {
    throw new CliError(
      "SKILL_MODIFIED",
      `Refusing to ${action} a locally modified nano-mem skill.`,
      CliErrorKind.runtime,
      `Run the command again with --force to ${action} the exact managed skill target.`,
    );
  }
  if (action === "update" && status === "not_installed") {
    throw new CliError(
      "SKILL_NOT_INSTALLED",
      "The nano-mem skill is not installed in the selected target.",
      CliErrorKind.runtime,
      "Install it before requesting an update.",
    );
  }
};

const mutationChangesState = (action: SkillMutation, status: SkillInstallStatus): boolean => {
  if (action === "uninstall") return status !== "not_installed";
  return status !== "current";
};

export const createManagedSkillService = (
  provided: ManagedSkillDependencies,
): ManagedSkillService => {
  const dependencies: ManagedSkillRuntime = {
    ...provided,
    createId: provided.createId ?? randomUUID,
    fileSystem: provided.fileSystem ?? nodeManagedSkillFileSystem,
  };
  const readStatus = (target?: string): ManagedSkillStatus =>
    statusAt(dependencies, targetPaths(dependencies, target, false));
  return {
    mutate: (
      action: SkillMutation,
      options: { dryRun: boolean; force: boolean; target?: string },
    ): ManagedSkillMutationResult => {
      const before = readStatus(options.target);
      assertMutationAllowed(action, before.status, options.force);
      const changed = mutationChangesState(action, before.status);
      const expectedAfter: SkillInstallStatus =
        action === "uninstall" ? "not_installed" : "current";
      if (changed && action !== "uninstall") assertPackagedSource(dependencies);
      if (!changed || options.dryRun) {
        return {
          action,
          after: changed ? expectedAfter : before.status,
          before: before.status,
          changed,
          dryRun: options.dryRun,
          packageVersion: dependencies.manifest.packageVersion,
          target: before.target,
        };
      }
      const paths = targetPaths(dependencies, options.target, true);
      if (action === "uninstall") uninstallSkill(dependencies, paths, options.force);
      else replaceSkill(dependencies, paths, action, options.force);
      const after = readStatus(options.target);
      return {
        action,
        after: after.status,
        before: before.status,
        changed,
        dryRun: false,
        packageVersion: dependencies.manifest.packageVersion,
        target: after.target,
      };
    },
    status: readStatus,
  };
};
