import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import { createMemoryRepository, MemoryScope } from "./memory-repository.js";
import { migrateMemoryDatabase, rebuildMemorySearchIndex } from "./memory-schema.js";

describe("memory database migration", (): void => {
  test("creates the versioned schema and can run repeatedly", (): void => {
    const database = new DatabaseSync(":memory:");
    migrateMemoryDatabase(database);
    migrateMemoryDatabase(database);
    expect(database.prepare("PRAGMA user_version").get()).toEqual({ user_version: 2 });
    expect(database.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(database.prepare("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE name IN ('memories', 'memories_fts') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: "memories" }, { name: "memories_fts" }]);
    database.close();
  });

  test("migrates and explicitly rebuilds tokenizer-derived search terms", (): void => {
    const database = new DatabaseSync(":memory:");
    migrateMemoryDatabase(database);
    const repository = createMemoryRepository({ database });
    const memory = repository.add({
      content: "使用cachePolicy",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    database.prepare("UPDATE memories SET search_terms = 'legacy' WHERE id = ?").run(memory.id);
    database.exec("PRAGMA user_version = 1");
    migrateMemoryDatabase(database);
    expect(
      database.prepare("SELECT search_terms FROM memories WHERE id = ?").get(memory.id),
    ).toEqual(expect.objectContaining({ search_terms: expect.stringContaining("policy") }));
    database.prepare("UPDATE memories SET search_terms = 'stale' WHERE id = ?").run(memory.id);
    rebuildMemorySearchIndex(database);
    expect(
      database.prepare("SELECT search_terms FROM memories WHERE id = ?").get(memory.id),
    ).toEqual(expect.objectContaining({ search_terms: expect.stringContaining("使用") }));
    database.close();
  });

  test("rejects a database created by a newer schema", (): void => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA user_version = 99");
    expect((): void => migrateMemoryDatabase(database)).toThrowError(
      expect.objectContaining({ code: "DATABASE_VERSION_UNSUPPORTED" }),
    );
    database.close();
  });

  test("rolls back a failed migration", (): void => {
    const database = new DatabaseSync(":memory:");
    database.exec("CREATE TABLE memories (occupied TEXT); PRAGMA user_version = 0;");
    expect((): void => migrateMemoryDatabase(database)).toThrow();
    expect(database.prepare("PRAGMA user_version").get()).toEqual({ user_version: 0 });
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE name = 'memories_fts'").get(),
    ).toBeUndefined();
    database.close();
  });
});
