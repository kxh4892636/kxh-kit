import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export const openSqliteDatabase = (filename: string) => {
  if (filename !== ":memory:") mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const connection = new Database(filename);
  const db = drizzle(connection);
  try {
    connection.pragma("journal_mode = WAL");
    migrate(db, { migrationsFolder: path.resolve("migrations") });
    return db;
  } catch (error) {
    connection.close();
    throw error;
  }
};

export type SqliteDatabase = ReturnType<typeof openSqliteDatabase>;
