import type { DatabaseSync } from "node:sqlite";

export const runImmediateTransaction = <T>(database: DatabaseSync, operation: () => T): T => {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};
