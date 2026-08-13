import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { Dirent } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { createManagedAgentsFile, mergeManagedAgents } from "./managed-agents.ts";

type CandidateStatus = "created" | "unchanged" | "updated";

interface FileCandidate {
  content: Buffer;
  destination: string;
  kind: "file";
  status: CandidateStatus;
}

interface DirectoryCandidate {
  destination: string;
  kind: "directory";
  source: string;
  status: CandidateStatus;
}

type InstallCandidate = DirectoryCandidate | FileCandidate;

interface AppliedCandidate {
  backup?: string;
  candidate: InstallCandidate;
}

interface InstallSummary {
  created: number;
  deleted: number;
  unchanged: number;
  updated: number;
}

interface InstallPlan {
  deleted: number;
  summaryCandidates: FileCandidate[];
  transactionCandidates: InstallCandidate[];
}

const listFiles = (root: string, current: string = root): string[] => {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry: Dirent): string[] => {
    const path = join(current, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [relative(root, path)];
  });
};

const listDirectories = (root: string, current: string = root): string[] => {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry: Dirent): string[] => {
    if (!entry.isDirectory()) {
      return [];
    }
    const path = join(current, entry.name);
    return [relative(root, path), ...listDirectories(root, path)];
  });
};

const createFileCandidate = (destination: string, content: Buffer | string): FileCandidate => {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (!existsSync(destination)) {
    return { content: next, destination, kind: "file", status: "created" };
  }

  const current = readFileSync(destination);
  return {
    content: next,
    destination,
    kind: "file",
    status: current.equals(next) ? "unchanged" : "updated",
  };
};

const createSummary = (candidates: FileCandidate[], deleted: number): InstallSummary => {
  const summary: InstallSummary = { created: 0, deleted, unchanged: 0, updated: 0 };
  for (const candidate of candidates) {
    summary[candidate.status] += 1;
  }
  return summary;
};

const directoriesMatch = (source: string, destination: string): boolean => {
  if (!existsSync(destination) || !statSync(destination).isDirectory()) {
    return false;
  }
  const sourceFiles = listFiles(source).sort();
  const destinationFiles = listFiles(destination).sort();
  const sourceDirectories = listDirectories(source).sort();
  const destinationDirectories = listDirectories(destination).sort();
  return (
    sourceDirectories.length === destinationDirectories.length &&
    sourceDirectories.every(
      (path: string, index: number): boolean => path === destinationDirectories[index],
    ) &&
    sourceFiles.length === destinationFiles.length &&
    sourceFiles.every(
      (path: string, index: number): boolean =>
        path === destinationFiles[index] &&
        readFileSync(join(source, path)).equals(readFileSync(join(destination, path))),
    )
  );
};

const createDirectoryCandidate = (source: string, destination: string): DirectoryCandidate => {
  const status = !existsSync(destination)
    ? "created"
    : directoriesMatch(source, destination)
      ? "unchanged"
      : "updated";
  return { destination, kind: "directory", source, status };
};

const listSkills = (root: string): string[] => {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return [];
  }
  return listFiles(root)
    .filter((path: string): boolean => basename(path) === "SKILL.md")
    .map((path: string): string => dirname(path));
};

const countDeletedSkills = (source: string, destination: string): number => {
  const sourceSkills = new Set(listSkills(source));
  return listSkills(destination).filter((skill: string): boolean => !sourceSkills.has(skill))
    .length;
};

const ensureParent = (path: string, createdDirectories: string[]): void => {
  const missing: string[] = [];
  let current = dirname(path);
  while (!existsSync(current)) {
    missing.push(current);
    current = dirname(current);
  }
  mkdirSync(dirname(path), { recursive: true });
  createdDirectories.push(...missing.reverse());
};

const applyCandidate = (
  candidate: InstallCandidate,
  staged: string,
  backup: string,
  createdDirectories: string[],
): AppliedCandidate => {
  ensureParent(candidate.destination, createdDirectories);
  if (candidate.status === "updated") {
    renameSync(candidate.destination, backup);
    try {
      renameSync(staged, candidate.destination);
    } catch (error: unknown) {
      renameSync(backup, candidate.destination);
      throw error;
    }
    return { backup, candidate };
  }

  renameSync(staged, candidate.destination);
  return { candidate };
};

const rollback = (applied: AppliedCandidate[], createdDirectories: string[]): void => {
  for (const item of [...applied].reverse()) {
    rmSync(item.candidate.destination, { force: true, recursive: true });
    if (item.backup !== undefined) {
      renameSync(item.backup, item.candidate.destination);
    }
  }
  for (const directory of [...createdDirectories].reverse()) {
    if (existsSync(directory)) {
      rmdirSync(directory);
    }
  }
};

const executeTransaction = (
  targetRoot: string,
  candidates: InstallCandidate[],
  afterApply?: (destination: string) => void,
): void => {
  const changed = candidates.filter(
    ({ status }: InstallCandidate): boolean => status !== "unchanged",
  );
  if (changed.length === 0) {
    return;
  }

  const stagingRoot = mkdtempSync(join(targetRoot, ".loop-kit-install-"));
  const applied: AppliedCandidate[] = [];
  const createdDirectories: string[] = [];
  try {
    const stagedFiles = changed.map((candidate: InstallCandidate, index: number): string => {
      const staged = join(stagingRoot, "staged", String(index));
      ensureParent(staged, []);
      if (candidate.kind === "file") {
        writeFileSync(staged, candidate.content);
      } else {
        cpSync(candidate.source, staged, { recursive: true });
      }
      return staged;
    });
    const backupRoot = join(stagingRoot, "backups");
    mkdirSync(backupRoot);

    changed.forEach((candidate: InstallCandidate, index: number): void => {
      const result = applyCandidate(
        candidate,
        stagedFiles[index] ?? "",
        join(backupRoot, String(index)),
        createdDirectories,
      );
      applied.push(result);
      afterApply?.(candidate.destination);
    });
  } catch (error: unknown) {
    try {
      rollback(applied, createdDirectories);
    } catch (rollbackError: unknown) {
      throw new AggregateError(
        [error, rollbackError],
        "Installation failed and rollback was incomplete",
      );
    }
    throw error;
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
};

const createPlan = (payloadRoot: string, targetRoot: string): InstallPlan => {
  const sourceAgents = readFileSync(join(payloadRoot, "AGENTS.md"), "utf8");
  const targetAgentsPath = join(targetRoot, "AGENTS.md");
  const nextAgents = existsSync(targetAgentsPath)
    ? mergeManagedAgents(sourceAgents, readFileSync(targetAgentsPath, "utf8"))
    : createManagedAgentsFile(sourceAgents);
  const managedFiles = [
    createFileCandidate(targetAgentsPath, nextAgents),
    createFileCandidate(
      join(targetRoot, "DOMAIN.md"),
      readFileSync(join(payloadRoot, "DOMAIN.md")),
    ),
  ];

  const sourceSkillsRoot = join(payloadRoot, ".agents", "skills", "loop-kit");
  const targetSkillsRoot = join(targetRoot, ".agents", "skills", "loop-kit");
  const skillFiles = listFiles(sourceSkillsRoot).map(
    (path: string): FileCandidate =>
      createFileCandidate(join(targetSkillsRoot, path), readFileSync(join(sourceSkillsRoot, path))),
  );
  return {
    deleted: countDeletedSkills(sourceSkillsRoot, targetSkillsRoot),
    summaryCandidates: [...managedFiles, ...skillFiles],
    transactionCandidates: [
      ...managedFiles,
      createDirectoryCandidate(sourceSkillsRoot, targetSkillsRoot),
    ],
  };
};

const installSnapshotWithObserver = (
  payloadRoot: string,
  targetRoot: string,
  afterApply?: (destination: string) => void,
): InstallSummary => {
  const plan = createPlan(payloadRoot, targetRoot);
  executeTransaction(targetRoot, plan.transactionCandidates, afterApply);
  return createSummary(plan.summaryCandidates, plan.deleted);
};

export const installSnapshot = (payloadRoot: string, targetRoot: string): InstallSummary => {
  return installSnapshotWithObserver(payloadRoot, targetRoot);
};

// This entry keeps deterministic failure injection outside the production installer contract.
export const installSnapshotForTest = (
  payloadRoot: string,
  targetRoot: string,
  afterApply: (destination: string) => void,
): void => {
  installSnapshotWithObserver(payloadRoot, targetRoot, afterApply);
};
