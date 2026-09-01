import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import { migrateMemoryDatabase } from "./memory-schema.js";

describe("memory database migration", (): void => {
  test("creates the versioned schema and can run repeatedly", (): void => {
    const database = new DatabaseSync(":memory:");
    migrateMemoryDatabase(database);
    migrateMemoryDatabase(database);
    expect(database.prepare("PRAGMA user_version").get()).toEqual({ user_version: 1 });
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
