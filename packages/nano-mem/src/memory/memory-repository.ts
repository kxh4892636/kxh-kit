import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { CliError, CliErrorKind } from "../cli-error.js";
import {
  applyGoodUse,
  initialRetentionState,
  LIFECYCLE_WEIGHT,
  lifecycleScore,
  retentionStatus,
  type RetentionState,
} from "./retention-state.js";
import { runImmediateTransaction } from "./memory-transaction.js";
import { toSearchQueryPlan, toSearchTerms } from "./search-tokenizer.js";

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

export interface SearchMemoryInput {
  limit: number;
  query: string;
  selector: MemorySelector;
}

export interface MemoryRepository {
  add: (input: AddMemoryInput) => { created: boolean; memory: MemoryRecord };
  delete: (id: string, selector: MemorySelector, force: boolean) => MemoryRecord;
  forget: (id: string, selector: MemorySelector) => MemoryRecord;
  get: (id: string, selector: MemorySelector) => MemoryRecord;
  list: (selector: MemorySelector) => readonly MemoryRecord[];
  restore: (id: string, selector: MemorySelector) => MemoryRecord;
  search: (input: SearchMemoryInput) => readonly MemoryRecord[];
  update: (input: UpdateMemoryInput) => MemoryRecord;
  use: (id: string, selector: MemorySelector) => MemoryRecord;
}

interface MemoryRow {
  content: string;
  created_at_ms: number;
  difficulty: number;
  explicit_forgotten_at_ms: number | null;
  id: string;
  last_used_at_ms: number | null;
  natural_forget_at_ms: number;
  policy_version: number;
  project_id: string;
  retention_anchor_at_ms: number;
  retrieval_count: number;
  scope: MemoryScope;
  source: string | null;
  stability: number;
  updated_at_ms: number;
  use_count: number;
}

interface SearchCandidateRow extends MemoryRow {
  lexical_rank: number;
  matched_group_count: number;
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
  id, content, source, scope, project_id,
  created_at_ms, updated_at_ms,
  policy_version, stability, difficulty, retention_anchor_at_ms,
  natural_forget_at_ms, explicit_forgotten_at_ms, last_used_at_ms,
  use_count, retrieval_count
`;

const qualifiedSelectedColumns = selectedColumns
  .split(",")
  .map((column: string): string => `m.${column.trim()}`)
  .join(", ");

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
  qualifier: string = "",
): { parameters: readonly string[]; sql: string } => {
  if (selector.scope === MemoryScope.project) {
    return {
      parameters: [selector.projectId],
      sql: `${qualifier}scope = 'project' AND ${qualifier}project_id = ?`,
    };
  }
  if (selector.scope === MemoryScope.global) {
    return { parameters: [], sql: `${qualifier}scope = 'global'` };
  }
  return {
    parameters: [selector.projectId],
    sql: `((${qualifier}scope = 'project' AND ${qualifier}project_id = ?) OR ${qualifier}scope = 'global')`,
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
        toSearchTerms(normalized.content),
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
    const nowMs = runtime.now().getTime();
    const source = input.sourceSpecified ? normalizeSource(input.source) : existing.source;
    if (normalized === undefined || normalized.content === existing.content) {
      // 内容未变的更新不触碰 content/search_terms 列：FTS trigger 在同值赋值时也会重建索引项。
      runtime.database
        .prepare("UPDATE memories SET source = ?, updated_at_ms = ? WHERE id = ?")
        .run(source, nowMs, existing.id);
      return toRecord(requireById(runtime.database, existing.id, input.selector));
    }
    const retention = initialRetentionState(nowMs);
    runtime.database
      .prepare(
        `UPDATE memories SET
          content = ?, identity_text = ?, content_hash = ?, search_terms = ?, source = ?,
          updated_at_ms = ?, policy_version = ?, stability = ?, difficulty = ?,
          retention_anchor_at_ms = ?, natural_forget_at_ms = ?, explicit_forgotten_at_ms = ?,
          last_used_at_ms = ?, use_count = ?, retrieval_count = ? WHERE id = ?`,
      )
      .run(
        normalized.content,
        normalized.identity,
        normalized.hash,
        toSearchTerms(normalized.content),
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

const writeRetentionState = (
  database: DatabaseSync,
  id: string,
  state: RetentionState,
  updatedAtMs: number,
): void => {
  database
    .prepare(
      `UPDATE memories SET policy_version = ?, stability = ?, difficulty = ?,
       retention_anchor_at_ms = ?, natural_forget_at_ms = ?, explicit_forgotten_at_ms = ?,
       last_used_at_ms = ?, use_count = ?, retrieval_count = ?, updated_at_ms = ? WHERE id = ?`,
    )
    .run(
      state.policyVersion,
      state.stability,
      state.difficulty,
      state.retentionAnchorAtMs,
      state.naturalForgetAtMs,
      state.explicitForgottenAtMs,
      state.lastUsedAtMs,
      state.useCount,
      state.retrievalCount,
      updatedAtMs,
      id,
    );
};

const forgetMemory = (
  runtime: RepositoryRuntime,
  id: string,
  selector: MemorySelector,
): MemoryRecord =>
  runImmediateTransaction(runtime.database, (): MemoryRecord => {
    const existing = requireById(runtime.database, id, selector);
    if (existing.explicit_forgotten_at_ms !== null) return toRecord(existing);
    const nowMs = runtime.now().getTime();
    runtime.database
      .prepare("UPDATE memories SET explicit_forgotten_at_ms = ?, updated_at_ms = ? WHERE id = ?")
      .run(nowMs, nowMs, id);
    return toRecord(requireById(runtime.database, id, selector));
  });

const restoreMemory = (
  runtime: RepositoryRuntime,
  id: string,
  selector: MemorySelector,
): MemoryRecord =>
  runImmediateTransaction(runtime.database, (): MemoryRecord => {
    const existing = requireById(runtime.database, id, selector);
    const nowMs = runtime.now().getTime();
    if (retentionStatus(toRecord(existing), nowMs).status === "active") {
      throw new CliError(
        "MEMORY_NOT_FORGOTTEN",
        "Only a forgotten memory can be restored.",
        CliErrorKind.runtime,
      );
    }
    writeRetentionState(runtime.database, id, initialRetentionState(nowMs), nowMs);
    return toRecord(requireById(runtime.database, id, selector));
  });

const useMemory = (
  runtime: RepositoryRuntime,
  id: string,
  selector: MemorySelector,
): MemoryRecord =>
  runImmediateTransaction(runtime.database, (): MemoryRecord => {
    const existing = requireById(runtime.database, id, selector);
    const nowMs = runtime.now().getTime();
    if (retentionStatus(toRecord(existing), nowMs).status === "forgotten") {
      throw new CliError(
        "MEMORY_FORGOTTEN",
        "A forgotten memory cannot be used.",
        CliErrorKind.runtime,
        "Restore the memory before recording use.",
      );
    }
    writeRetentionState(runtime.database, id, applyGoodUse(toRecord(existing), nowMs), nowMs);
    return toRecord(requireById(runtime.database, id, selector));
  });

const normalizedLexicalScore = (rank: number, mostRelevant: number): number =>
  mostRelevant === 0 ? 1 : -rank / mostRelevant;

const rankCandidates = (
  rows: readonly SearchCandidateRow[],
  nowMs: number,
): readonly SearchCandidateRow[] => {
  if (rows.length < 2) return rows;
  const relevances = rows.map((row: SearchCandidateRow): number => -row.lexical_rank);
  const mostRelevant = Math.max(...relevances);
  return [...rows].sort((left: SearchCandidateRow, right: SearchCandidateRow): number => {
    const leftLexical = normalizedLexicalScore(left.lexical_rank, mostRelevant);
    const rightLexical = normalizedLexicalScore(right.lexical_rank, mostRelevant);
    const leftScore = leftLexical * (1 - LIFECYCLE_WEIGHT) + lifecycleScore(toRecord(left), nowMs);
    const rightScore =
      rightLexical * (1 - LIFECYCLE_WEIGHT) + lifecycleScore(toRecord(right), nowMs);
    return (
      rightScore - leftScore ||
      left.lexical_rank - right.lexical_rank ||
      left.id.localeCompare(right.id)
    );
  });
};

const tieredSearchSql = (predicateSql: string): string => `
  WITH query_groups(match_query) AS (SELECT value FROM json_each(?)),
  group_matches(rowid) AS (
    SELECT memories_fts.rowid FROM query_groups JOIN memories_fts
    WHERE memories_fts MATCH query_groups.match_query
  ),
  match_counts AS (
    SELECT rowid, COUNT(*) AS matched_group_count
    FROM group_matches GROUP BY rowid
  ),
  eligible_counts AS (
    SELECT counts.rowid, counts.matched_group_count
    FROM match_counts AS counts JOIN memories AS eligible ON eligible.rowid = counts.rowid
    WHERE eligible.explicit_forgotten_at_ms IS NULL
      AND eligible.natural_forget_at_ms > ? AND ${predicateSql}
  ),
  layers AS (
    SELECT matched_group_count,
      SUM(COUNT(*)) OVER (ORDER BY matched_group_count DESC) AS cumulative_count
    FROM eligible_counts GROUP BY matched_group_count
  ),
  boundary AS (
    SELECT COALESCE(
      (SELECT matched_group_count FROM layers WHERE cumulative_count >= ?
       ORDER BY matched_group_count DESC LIMIT 1),
      (SELECT MIN(matched_group_count) FROM layers)
    ) AS matched_group_count
  )
  SELECT ${qualifiedSelectedColumns},
    bm25(memories_fts, 1.0, 3.0) AS lexical_rank,
    counts.matched_group_count
  FROM memories_fts
  JOIN memories AS m ON m.rowid = memories_fts.rowid
  JOIN eligible_counts AS counts ON counts.rowid = m.rowid
  CROSS JOIN boundary
  WHERE memories_fts MATCH ? AND counts.matched_group_count >= boundary.matched_group_count
`;

const rankCandidateTiers = (
  rows: readonly SearchCandidateRow[],
  nowMs: number,
): readonly SearchCandidateRow[] => {
  const tiers = new Map<number, SearchCandidateRow[]>();
  for (const row of rows) {
    const tier = tiers.get(row.matched_group_count) ?? [];
    tier.push(row);
    tiers.set(row.matched_group_count, tier);
  }
  return [...tiers.entries()]
    .sort(
      ([left]: [number, SearchCandidateRow[]], [right]: [number, SearchCandidateRow[]]): number =>
        right - left,
    )
    .flatMap(([, tier]: [number, SearchCandidateRow[]]): readonly SearchCandidateRow[] =>
      rankCandidates(tier, nowMs),
    );
};

const searchMemories = (
  runtime: RepositoryRuntime,
  input: SearchMemoryInput,
): readonly MemoryRecord[] => {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) {
    throw new CliError(
      "INVALID_LIMIT",
      "Search limit must be an integer from 1 to 50.",
      CliErrorKind.usage,
    );
  }
  const queryPlan = toSearchQueryPlan(input.query);
  if (queryPlan === undefined) return [];
  const predicate = scopePredicate(input.selector, "eligible.");
  const nowMs = runtime.now().getTime();
  // 候选由单条 SELECT 在一致快照中读取，重排仅使用内存数据，无需申请写事务。
  const rows = runtime.database
    .prepare(tieredSearchSql(predicate.sql))
    .all(
      JSON.stringify(queryPlan.groupMatchQueries),
      nowMs,
      ...predicate.parameters,
      input.limit,
      queryPlan.flatMatchQuery,
    ) as unknown as SearchCandidateRow[];
  return rankCandidateTiers(rows, nowMs)
    .slice(0, input.limit)
    .map((row: MemoryRow): MemoryRecord => toRecord(row));
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
    forget: (id: string, selector: MemorySelector): MemoryRecord =>
      forgetMemory(runtime, id, selector),
    get: (id: string, selector: MemorySelector): MemoryRecord =>
      toRecord(requireById(runtime.database, id, selector)),
    list: (selector: MemorySelector): readonly MemoryRecord[] =>
      listMemories(runtime.database, selector),
    restore: (id: string, selector: MemorySelector): MemoryRecord =>
      restoreMemory(runtime, id, selector),
    search: (input: SearchMemoryInput): readonly MemoryRecord[] => searchMemories(runtime, input),
    update: (input: UpdateMemoryInput): MemoryRecord => updateMemory(runtime, input),
    use: (id: string, selector: MemorySelector): MemoryRecord => useMemory(runtime, id, selector),
  };
};
