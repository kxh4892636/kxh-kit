import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { Dirent } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createManagedAgentsFile, mergeManagedAgents } from "./managed-agents.ts";

type CandidateStatus = "created" | "unchanged" | "updated";

interface InstallCandidate {
  content: Buffer;
  destination: string;
  status: CandidateStatus;
}

interface AppliedCandidate {
  backup?: string;
  candidate: InstallCandidate;
}

interface InstallSummary {
  created: number;
  unchanged: number;
  updated: number;
}

const listFiles = (root: string, current: string = root): string[] => {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry: Dirent): string[] => {
    const path = join(current, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [relative(root, path)];
  });
};

const createCandidate = (destination: string, content: Buffer | string): InstallCandidate => {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (!existsSync(destination)) {
    return { content: next, destination, status: "created" };
  }

  const current = readFileSync(destination);
  return {
    content: next,
    destination,
    status: current.equals(next) ? "unchanged" : "updated",
  };
};

const createSummary = (candidates: InstallCandidate[]): InstallSummary => {
  const summary: InstallSummary = { created: 0, unchanged: 0, updated: 0 };
  for (const candidate of candidates) {
    summary[candidate.status] += 1;
  }
  return summary;
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
    rmSync(item.candidate.destination, { force: true });
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

const executeTransaction = (targetRoot: string, candidates: InstallCandidate[]): void => {
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
      writeFileSync(staged, candidate.content);
      return staged;
    });
    const backupRoot = join(stagingRoot, "backups");
    mkdirSync(backupRoot);

    changed.forEach((candidate: InstallCandidate, index: number): void => {
      applied.push(
        applyCandidate(
          candidate,
          stagedFiles[index] ?? "",
          join(backupRoot, String(index)),
          createdDirectories,
        ),
      );
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

const createCandidates = (payloadRoot: string, targetRoot: string): InstallCandidate[] => {
  const sourceAgents = readFileSync(join(payloadRoot, "AGENTS.md"), "utf8");
  const targetAgentsPath = join(targetRoot, "AGENTS.md");
  const nextAgents = existsSync(targetAgentsPath)
    ? mergeManagedAgents(sourceAgents, readFileSync(targetAgentsPath, "utf8"))
    : createManagedAgentsFile(sourceAgents);
  const candidates = [
    createCandidate(targetAgentsPath, nextAgents),
    createCandidate(join(targetRoot, "DOMAIN.md"), readFileSync(join(payloadRoot, "DOMAIN.md"))),
  ];

  const skillsRoot = join(payloadRoot, ".agents", "skills", "loop-kit");
  for (const relativePath of listFiles(skillsRoot)) {
    candidates.push(
      createCandidate(
        join(targetRoot, ".agents", "skills", "loop-kit", relativePath),
        readFileSync(join(skillsRoot, relativePath)),
      ),
    );
  }
  return candidates;
};

export const installSnapshot = (payloadRoot: string, targetRoot: string): InstallSummary => {
  const candidates = createCandidates(payloadRoot, targetRoot);
  executeTransaction(targetRoot, candidates);
  return createSummary(candidates);
};
