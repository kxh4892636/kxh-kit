import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./server/market/repository/sqlite/schema.ts",
  out: "./migrations",
});
