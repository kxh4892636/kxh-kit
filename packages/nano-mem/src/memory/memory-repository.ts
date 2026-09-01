import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { CliError, CliErrorKind } from "../cli-error.js";
import { initialRetentionState, type RetentionState } from "./retention-state.js";
import { runImmediateTransaction } from "./memory-transaction.js";

export const MemoryScope = {
  global: "global",
  project: "project",
} as const;

export type MemoryScope = (typeof MemoryScope)[keyof typeof MemoryScope];
export type ReadScope = MemoryScope | "all";

export interface MemoryRecord extends RetentionState {
  content: string;
  createdAtMs: number;
  id: string;
  projectId: string;
  scope: MemoryScope;
  source: string | null;
  updatedAtMs: number;
}

export interface MemorySelector {
  projectId: string;
  scope: ReadScope;
}

export interface AddMemoryInput {
  content: string;
  projectId: string;
  scope: MemoryScope;
  source?: string;
}

export interface UpdateMemoryInput {
  content?: string;
  id: string;
  selector: MemorySelector;
  source?: string | null;
  sourceSpecified: boolean;
}

export interface MemoryRepository {
  add: (input: AddMemoryInput) => { created: boolean; memory: MemoryRecord };
  delete: (id: string, selector: MemorySelector, force: boolean) => MemoryRecord;
  get: (id: string, selector: MemorySelector) => MemoryRecord;
  list: (selector: MemorySelector) => readonly MemoryRecord[];
  update: (input: UpdateMemoryInput) => MemoryRecord;
}

interface MemoryRow {
  content: string;
  content_hash: string;
  created_at_ms: number;
  difficulty: number;
  explicit_forgotten_at_ms: number | null;
  id: string;
  identity_text: string;
  last_used_at_ms: number | null;
  natural_forget_at_ms: number;
  policy_version: number;
  project_id: string;
  retention_anchor_at_ms: number;
  retrieval_count: number;
  scope: MemoryScope;
  search_terms: string;
  source: string | null;
  stability: number;
  updated_at_ms: number;
  use_count: number;
}

interface RepositoryDependencies {
  createId?: () => string;
  database: DatabaseSync;
  now?: () => Date;
}

interface RepositoryRuntime {
  createId: () => string;
  database: DatabaseSync;
  now: () => Date;
}

const selectedColumns = `
  id, content, identity_text, content_hash, search_terms, source, scope, project_id,
  created_at_ms, updated_at_ms,
  policy_version, stability, difficulty, retention_anchor_at_ms,
  natural_forget_at_ms, explicit_forgotten_at_ms, last_used_at_ms,
  use_count, retrieval_count
`;

const normalizeIdentity = (
  content: string,
): { content: string; hash: string; identity: string } => {
  const storedContent = content.trim();
  const identity = storedContent.normalize("NFKC").replace(/\s+/gu, " ");
  if (identity === "") {
    throw new CliError("EMPTY_TEXT_INPUT", "Memory content cannot be empty.", CliErrorKind.usage);
  }
  return {
    content: storedContent,
    hash: createHash("sha256").update(identity).digest("hex"),
    identity,
  };
};

const normalizeSource = (source: string | null | undefined): string | null => {
  if (source === null || source === undefined) return null;
  const normalized = source.trim();
  return normalized === "" ? null : normalized;
};

const toRecord = (row: MemoryRow): MemoryRecord => ({
  content: row.content,
  createdAtMs: row.created_at_ms,
  difficulty: row.difficulty,
  explicitForgottenAtMs: row.explicit_forgotten_at_ms,
  id: row.id,
  lastUsedAtMs: row.last_used_at_ms,
  naturalForgetAtMs: row.natural_forget_at_ms,
  policyVersion: row.policy_version,
  projectId: row.project_id,
  retentionAnchorAtMs: row.retention_anchor_at_ms,
  retrievalCount: row.retrieval_count,
  scope: row.scope,
  source: row.source,
  stability: row.stability,
  updatedAtMs: row.updated_at_ms,
  useCount: row.use_count,
});

const scopePredicate = (
  selector: MemorySelector,
): { parameters: readonly string[]; sql: string } => {
  if (selector.scope === MemoryScope.project) {
    return { parameters: [selector.projectId], sql: "scope = 'project' AND project_id = ?" };
  }
  if (selector.scope === MemoryScope.global) {
    return { parameters: [], sql: "scope = 'global'" };
  }
  return {
    parameters: [selector.projectId],
    sql: "((scope = 'project' AND project_id = ?) OR scope = 'global')",
  };
};

const findById = (
  database: DatabaseSync,
  id: string,
  selector: MemorySelector,
): MemoryRow | undefined => {
  const predicate = scopePredicate(selector);
  return database
    .prepare(`SELECT ${selectedColumns} FROM memories WHERE id = ? AND ${predicate.sql}`)
    .get(id, ...predicate.parameters) as MemoryRow | undefined;
};

const requireById = (database: DatabaseSync, id: string, selector: MemorySelector): MemoryRow => {
  const row = findById(database, id, selector);
  if (row !== undefined) return row;
  throw new CliError(
    "MEMORY_NOT_FOUND",
    `Memory ${id} was not found in the selected scope.`,
    CliErrorKind.runtime,
  );
};

const findByIdentity = (
  database: DatabaseSync,
  scope: MemoryScope,
  projectId: string,
  hash: string,
): MemoryRow | undefined =>
  database
    .prepare(
      `SELECT ${selectedColumns} FROM memories
       WHERE scope = ? AND project_id = ? AND content_hash = ?`,
    )
    .get(scope, projectId, hash) as MemoryRow | undefined;

const addMemory = (
  runtime: RepositoryRuntime,
  input: AddMemoryInput,
): { created: boolean; memory: MemoryRecord } =>
  runImmediateTransaction(runtime.database, (): { created: boolean; memory: MemoryRecord } => {
    const normalized = normalizeIdentity(input.content);
    const projectId = input.scope === MemoryScope.global ? "" : input.projectId;
    const existing = findByIdentity(runtime.database, input.scope, projectId, normalized.hash);
    if (existing !== undefined) return { created: false, memory: toRecord(existing) };
    const nowMs = runtime.now().getTime();
    const retention = initialRetentionState(nowMs);
    const id = runtime.createId();
    runtime.database
      .prepare(
        `INSERT INTO memories (
            id, content, identity_text, content_hash, search_terms, source, scope, project_id,
            created_at_ms, updated_at_ms, policy_version, stability, difficulty,
            retention_anchor_at_ms, natural_forget_at_ms, explicit_forgotten_at_ms,
            last_used_at_ms, use_count, retrieval_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        normalized.content,
        normalized.identity,
        normalized.hash,
        normalized.identity,
        normalizeSource(input.source),
        input.scope,
        projectId,
        nowMs,
        nowMs,
        retention.policyVersion,
        retention.stability,
        retention.difficulty,
        retention.retentionAnchorAtMs,
        retention.naturalForgetAtMs,
        retention.explicitForgottenAtMs,
        retention.lastUsedAtMs,
        retention.useCount,
        retention.retrievalCount,
      );
    return {
      created: true,
      memory: toRecord(requireById(runtime.database, id, { projectId, scope: input.scope })),
    };
  });

const listMemories = (
  database: DatabaseSync,
  selector: MemorySelector,
): readonly MemoryRecord[] => {
  const predicate = scopePredicate(selector);
  const rows = database
    .prepare(
      `SELECT ${selectedColumns} FROM memories WHERE ${predicate.sql}
       ORDER BY created_at_ms DESC, id ASC`,
    )
    .all(...predicate.parameters) as unknown as MemoryRow[];
  return rows.map((row: MemoryRow): MemoryRecord => toRecord(row));
};

const assertNoIdentityCollision = (
  database: DatabaseSync,
  existing: MemoryRow,
  hash: string,
): void => {
  const collision = findByIdentity(database, existing.scope, existing.project_id, hash);
  if (collision === undefined || collision.id === existing.id) return;
  throw new CliError(
    "MEMORY_IDENTITY_CONFLICT",
    "Another memory already has the requested content in this scope.",
    CliErrorKind.runtime,
  );
};

const updateMemory = (runtime: RepositoryRuntime, input: UpdateMemoryInput): MemoryRecord =>
  runImmediateTransaction(runtime.database, (): MemoryRecord => {
    const existing = requireById(runtime.database, input.id, input.selector);
    if (input.content === undefined && !input.sourceSpecified) {
      throw new CliError(
        "EMPTY_UPDATE",
        "Update requires content or --source.",
        CliErrorKind.usage,
      );
    }
    const normalized = input.content === undefined ? undefined : normalizeIdentity(input.content);
    if (normalized !== undefined) {
      assertNoIdentityCollision(runtime.database, existing, normalized.hash);
    }
    const contentChanged = normalized !== undefined && normalized.content !== existing.content;
    const nowMs = runtime.now().getTime();
    const retention = contentChanged ? initialRetentionState(nowMs) : toRecord(existing);
    const source = input.sourceSpecified ? normalizeSource(input.source) : existing.source;
    runtime.database
      .prepare(
        `UPDATE memories SET
          content = ?, identity_text = ?, content_hash = ?, search_terms = ?, source = ?,
          updated_at_ms = ?, policy_version = ?, stability = ?, difficulty = ?,
          retention_anchor_at_ms = ?, natural_forget_at_ms = ?, explicit_forgotten_at_ms = ?,
          last_used_at_ms = ?, use_count = ?, retrieval_count = ? WHERE id = ?`,
      )
      .run(
        normalized?.content ?? existing.content,
        normalized?.identity ?? existing.identity_text,
        normalized?.hash ?? existing.content_hash,
        normalized?.identity ?? existing.search_terms,
        source,
        nowMs,
        retention.policyVersion,
        retention.stability,
        retention.difficulty,
        retention.retentionAnchorAtMs,
        retention.naturalForgetAtMs,
        retention.explicitForgottenAtMs,
        retention.lastUsedAtMs,
        retention.useCount,
        retention.retrievalCount,
        existing.id,
      );
    return toRecord(requireById(runtime.database, existing.id, input.selector));
  });

const deleteMemory = (
  database: DatabaseSync,
  id: string,
  selector: MemorySelector,
  force: boolean,
): MemoryRecord => {
  if (!force) {
    throw new CliError(
      "DELETE_REQUIRES_FORCE",
      "Permanent deletion requires --force.",
      CliErrorKind.usage,
    );
  }
  return runImmediateTransaction(database, (): MemoryRecord => {
    const existing = requireById(database, id, selector);
    database.prepare("DELETE FROM memories WHERE id = ?").run(id);
    return toRecord(existing);
  });
};

export const createMemoryRepository = (dependencies: RepositoryDependencies): MemoryRepository => {
  const runtime: RepositoryRuntime = {
    createId: dependencies.createId ?? randomUUID,
    database: dependencies.database,
    now: dependencies.now ?? ((): Date => new Date()),
  };
  return {
    add: (input: AddMemoryInput): { created: boolean; memory: MemoryRecord } =>
      addMemory(runtime, input),
    delete: (id: string, selector: MemorySelector, force: boolean): MemoryRecord =>
      deleteMemory(runtime.database, id, selector, force),
    get: (id: string, selector: MemorySelector): MemoryRecord =>
      toRecord(requireById(runtime.database, id, selector)),
    list: (selector: MemorySelector): readonly MemoryRecord[] =>
      listMemories(runtime.database, selector),
    update: (input: UpdateMemoryInput): MemoryRecord => updateMemory(runtime, input),
  };
};
