import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { securities } from "./schema.ts";
import { supportedSecurities, type Security } from "../market/securities.ts";

export const openDatabase = (filename: string): ReturnType<typeof drizzle> => {
  if (filename !== ":memory:") mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const connection = new Database(filename);
  const db = drizzle(connection);
  try {
    connection.pragma("journal_mode = WAL");
    migrate(db, { migrationsFolder: fileURLToPath(new URL("../../migrations", import.meta.url)) });
    db.transaction((transaction): void => {
      for (const definition of supportedSecurities)
        transaction
          .insert(securities)
          .values(definition)
          .onConflictDoUpdate({ target: securities.symbol, set: definition })
          .run();
    });
    return db;
  } catch (error) {
    connection.close();
    throw error;
  }
};
export const createSecurityStore = (
  db: ReturnType<typeof drizzle>,
): { listSecurities: () => Security[] } => ({
  listSecurities: (): Security[] => db.select().from(securities).orderBy(securities.symbol).all(),
});
