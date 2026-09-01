import type { DatabaseSync } from "node:sqlite";
import { CliError, CliErrorKind } from "../cli-error.js";
import { runImmediateTransaction } from "./memory-transaction.js";

const schemaVersion = 1;

const schemaSql = `
  CREATE TABLE memories (
    id TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    identity_text TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    search_terms TEXT NOT NULL,
    source TEXT NULL,
    scope TEXT NOT NULL CHECK(scope IN ('project', 'global')),
    project_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    policy_version INTEGER NOT NULL,
    stability REAL NOT NULL,
    difficulty REAL NOT NULL,
    retention_anchor_at_ms INTEGER NOT NULL,
    natural_forget_at_ms INTEGER NOT NULL,
    explicit_forgotten_at_ms INTEGER NULL,
    last_used_at_ms INTEGER NULL,
    use_count INTEGER NOT NULL DEFAULT 0,
    retrieval_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(scope, project_id, content_hash)
  );
  CREATE VIRTUAL TABLE memories_fts USING fts5(
    content,
    search_terms,
    content = 'memories',
    content_rowid = 'rowid'
  );
  CREATE TRIGGER memories_fts_insert AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content, search_terms)
    VALUES (new.rowid, new.content, new.search_terms);
  END;
  CREATE TRIGGER memories_fts_delete AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, search_terms)
    VALUES ('delete', old.rowid, old.content, old.search_terms);
  END;
  CREATE TRIGGER memories_fts_update AFTER UPDATE OF content, search_terms ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, search_terms)
    VALUES ('delete', old.rowid, old.content, old.search_terms);
    INSERT INTO memories_fts(rowid, content, search_terms)
    VALUES (new.rowid, new.content, new.search_terms);
  END;
  PRAGMA user_version = 1;
`;

export const migrateMemoryDatabase = (database: DatabaseSync): void => {
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  const versionRow = database.prepare("PRAGMA user_version").get() as
    | { user_version: number }
    | undefined;
  const version = versionRow?.user_version ?? 0;
  if (version > schemaVersion) {
    throw new CliError(
      "DATABASE_VERSION_UNSUPPORTED",
      `Database schema version ${version} is newer than supported version ${schemaVersion}.`,
      CliErrorKind.runtime,
    );
  }
  if (version === schemaVersion) return;
  runImmediateTransaction(database, (): void => {
    database.exec(schemaSql);
    database.exec("INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')");
  });
};
