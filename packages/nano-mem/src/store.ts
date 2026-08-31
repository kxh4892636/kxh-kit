import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { StatementSync } from "node:sqlite";
import { cjkTokenize } from "./split";

/** 持久化的显式状态：仅 delete → trashed；休眠状态由查询侧惰性判定（issue 04）。 */
export type MemoryState = "active" | "trashed";

export interface AddMemoryInput {
  readonly text: string;
  readonly agent: string;
  readonly run?: string;
  readonly tags?: readonly string[];
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface AddMemoryResult {
  readonly id: number;
  readonly duplicate: boolean;
}

export interface ListMemoryOptions {
  readonly agent?: string;
  readonly run?: string;
  /** 全部命中的标签（AND）；空数组视为无过滤。 */
  readonly tags?: readonly string[];
  readonly state?: MemoryState | readonly MemoryState[];
  readonly limit?: number;
}

export interface Memory {
  readonly id: number;
  readonly text: string;
  readonly textHash: string;
  readonly agent: string;
  readonly runKey: string;
  readonly tags: readonly string[];
  readonly meta: Readonly<Record<string, unknown>>;
  readonly state: MemoryState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastReview: string | null;
  readonly due: string | null;
  readonly stability: number;
  readonly difficulty: number;
  readonly reps: number;
  readonly lapses: number;
  readonly fsrsState: number;
  readonly trashedAt: string | null;
}

/** FTS5 命中结果；bm25 为负值，越接近 0 越相关（排序在 issue 04 之上叠加）。 */
export interface FtsHit {
  readonly id: number;
  readonly bm25: number;
}

interface MemoryRow {
  readonly id: number;
  readonly text: string;
  readonly text_hash: string;
  readonly agent: string;
  readonly run_key: string;
  readonly tags: string;
  readonly meta: string;
  readonly state: MemoryState;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_review: string | null;
  readonly due: string | null;
  readonly stability: number;
  readonly difficulty: number;
  readonly reps: number;
  readonly lapses: number;
  readonly fsrs_state: number;
  readonly trashed_at: string | null;
}

interface FtsHitRow {
  readonly id: number;
  readonly bm25: number;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,          -- sha256(text)
  agent TEXT NOT NULL,
  run_key TEXT NOT NULL DEFAULT '', -- run ?? ''
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
  meta TEXT NOT NULL DEFAULT '{}',  -- JSON object
  state TEXT NOT NULL DEFAULT 'active',  -- 仅显式转移：delete → trashed
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_review TEXT,
  due TEXT,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  fsrs_state INTEGER NOT NULL DEFAULT 0, -- ts-fsrs Card.state
  trashed_at TEXT,
  UNIQUE(agent, run_key, text_hash)
);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(text_tok, content='', tokenize='unicode61');
-- rowid = memories.id；add/delete 由代码同步 FTS（v1 无文本更新路径）
`;

const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex");

const parseTags = (raw: string): readonly string[] => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
};

const parseMeta = (raw: string): Readonly<Record<string, unknown>> => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

const rowToMemory = (row: MemoryRow): Memory => ({
  id: row.id,
  text: row.text,
  textHash: row.text_hash,
  agent: row.agent,
  runKey: row.run_key,
  tags: parseTags(row.tags),
  meta: parseMeta(row.meta),
  state: row.state,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastReview: row.last_review,
  due: row.due,
  stability: row.stability,
  difficulty: row.difficulty,
  reps: row.reps,
  lapses: row.lapses,
  fsrsState: row.fsrs_state,
  trashedAt: row.trashed_at,
});

/**
 * 记忆库存储层：schema 初始化 + 记忆 CRUD + FTS5 同步 + 确定性去重。
 *
 * - 去重：UNIQUE(agent, run_key, text_hash)，text_hash = sha256(text)，run_key = run ?? ''；
 *   重复 add 返回既有 id（duplicate=true），记录不更新。
 * - FTS 同步：add → INSERT memories_fts(rowid, text_tok)；state 变为 trashed → 移除 FTS 行。
 *   content='' 的 fts5 表不支持 DELETE 语句，需用 special command 并携带原文列值。
 * - `:memory:` 与文件路径均支持；传入 DatabaseSync 实例时不负责关闭。
 */
export class MemoryStore {
  readonly #db: DatabaseSync;
  readonly #ownsDatabase: boolean;
  readonly #insertMemory: StatementSync;
  readonly #selectByHash: StatementSync;
  readonly #selectById: StatementSync;
  readonly #insertFts: StatementSync;
  readonly #ftsRowExists: StatementSync;
  readonly #deleteFts: StatementSync;
  readonly #updateTrashed: StatementSync;
  readonly #updateActive: StatementSync;
  readonly #updateTouched: StatementSync;
  readonly #searchFts: StatementSync;

  constructor(db: string | DatabaseSync) {
    this.#db = typeof db === "string" ? new DatabaseSync(db) : db;
    this.#ownsDatabase = typeof db === "string";
    this.#db.exec(SCHEMA_SQL);
    this.#insertMemory = this.#db.prepare(
      `INSERT INTO memories (text, text_hash, agent, run_key, tags, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent, run_key, text_hash) DO NOTHING`,
    );
    this.#selectByHash = this.#db.prepare(
      "SELECT id FROM memories WHERE agent = ? AND run_key = ? AND text_hash = ?",
    );
    this.#selectById = this.#db.prepare("SELECT * FROM memories WHERE id = ?");
    this.#insertFts = this.#db.prepare("INSERT INTO memories_fts (rowid, text_tok) VALUES (?, ?)");
    this.#ftsRowExists = this.#db.prepare("SELECT rowid FROM memories_fts WHERE rowid = ?");
    // contentless fts5 无 DELETE 语句；special command 需携带写入时的列值，
    // 且对不存在的 rowid 执行会立即损坏索引——调用前必须用 #ftsRowExists 守护。
    this.#deleteFts = this.#db.prepare(
      "INSERT INTO memories_fts (memories_fts, rowid, text_tok) VALUES ('delete', ?, ?)",
    );
    this.#updateTrashed = this.#db.prepare(
      "UPDATE memories SET state = 'trashed', trashed_at = ?, updated_at = ? WHERE id = ?",
    );
    this.#updateActive = this.#db.prepare(
      "UPDATE memories SET state = 'active', trashed_at = NULL, updated_at = ? WHERE id = ?",
    );
    this.#updateTouched = this.#db.prepare("UPDATE memories SET updated_at = ? WHERE id = ?");
    this.#searchFts = this.#db.prepare(
      "SELECT rowid AS id, bm25(memories_fts) AS bm25 FROM memories_fts\n" +
        "WHERE memories_fts MATCH ? ORDER BY bm25 DESC",
    );
  }

  /** 新增记忆；同 agent + run_key + text_hash 已存在时返回既有 id（不更新记录）。 */
  add(input: AddMemoryInput): AddMemoryResult {
    const { text, agent } = input;
    const runKey = input.run ?? "";
    const textHash = sha256Hex(text);
    const now = new Date().toISOString();
    const tags = JSON.stringify(input.tags ?? []);
    const meta = JSON.stringify(input.meta ?? {});
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const inserted = this.#insertMemory.run(text, textHash, agent, runKey, tags, meta, now, now);
      if (inserted.changes === 0) {
        const existing = this.#selectByHash.get(agent, runKey, textHash) as unknown as
          | { readonly id: number }
          | undefined;
        if (existing === undefined) {
          throw new Error(`inconsistent store: memory ${runKey}/${agent} duplicated but not found`);
        }
        this.#db.exec("COMMIT");
        return { id: existing.id, duplicate: true };
      }
      const id = Number(inserted.lastInsertRowid);
      this.#insertFts.run(id, cjkTokenize(text));
      this.#db.exec("COMMIT");
      return { id, duplicate: false };
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  get(id: number): Memory | null {
    const row = this.#selectById.get(id) as unknown as MemoryRow | undefined;
    return row === undefined ? null : rowToMemory(row);
  }

  /** 按 agent/run/tags/state/limit 过滤；未指定的过滤条件不生效，新纪录优先。 */
  list(options: ListMemoryOptions = {}): Memory[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (options.agent !== undefined) {
      where.push("agent = ?");
      params.push(options.agent);
    }
    if (options.run !== undefined) {
      where.push("run_key = ?");
      params.push(options.run);
    }
    const states =
      options.state === undefined
        ? []
        : typeof options.state === "string"
          ? [options.state]
          : options.state;
    if (states.length > 0) {
      where.push(`state IN (${states.map(() => "?").join(", ")})`);
      params.push(...states);
    }
    if (options.tags !== undefined) {
      for (const tag of options.tags) {
        where.push("EXISTS (SELECT 1 FROM json_each(memories.tags) WHERE value = ?)");
        params.push(tag);
      }
    }
    const baseSql = `SELECT * FROM memories${where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC`;
    const sql = options.limit === undefined ? baseSql : `${baseSql} LIMIT ?`;
    const paramsWithLimit = options.limit === undefined ? params : [...params, options.limit];
    const rows = this.#db.prepare(sql).all(...paramsWithLimit) as unknown as MemoryRow[];
    return rows.map(rowToMemory);
  }

  /** 软删除：state=trashed + trashed_at，并移除 FTS 行；返回是否存在该 id。 */
  delete(id: number): boolean {
    return this.setState(id, "trashed") !== null;
  }

  /** 显式状态转移；transition 时同步 FTS 行（trashed ⇔ 无 FTS 行）。 */
  setState(id: number, state: MemoryState): Memory | null {
    const row = this.#selectById.get(id) as unknown as MemoryRow | undefined;
    if (row === undefined) return null;
    if (row.state === state) return rowToMemory(row);
    const now = new Date().toISOString();
    const tokens = cjkTokenize(row.text);
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const ftsRowExists = this.#ftsRowExists.get(id) !== undefined;
      if (state === "active") {
        this.#updateActive.run(now, id);
        if (!ftsRowExists) this.#insertFts.run(id, tokens);
      } else {
        if (ftsRowExists) this.#deleteFts.run(id, tokens);
        this.#updateTrashed.run(now, now, id);
      }
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return this.get(id);
  }

  /** 仅刷新 updated_at。 */
  touch(id: number): Memory | null {
    const changed = this.#updateTouched.run(new Date().toISOString(), id);
    return changed.changes === 0 ? null : this.get(id);
  }

  /**
   * FTS5 命中查询 + bm25 取分（负值，越接近 0 越相关）。
   * match 须为已归一（cjkTokenize）的检索式；排序/评分公式在 issue 04 之上叠加。
   */
  searchFts(match: string): FtsHit[] {
    const rows = this.#searchFts.all(match) as unknown as FtsHitRow[];
    return rows.map((row) => ({ id: row.id, bm25: row.bm25 }));
  }

  /** 关闭 store 自建的连接；外部传入的 DatabaseSync 实例由调用方管理。 */
  close(): void {
    if (this.#ownsDatabase) this.#db.close();
  }
}
