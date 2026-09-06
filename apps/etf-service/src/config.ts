import { readFileSync } from "node:fs";
import { z } from "zod";
const settings = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_DSN: z.string().trim().min(1),
});
export interface Config {
  port: number;
  databaseDsn: string;
}
export const loadConfig = (file: string, environment: NodeJS.ProcessEnv = process.env): Config => {
  const values: Record<string, string> = {};
  let contents = "";
  try {
    contents = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim(),
      value = trimmed.slice(index + 1).trim();
    if (index < 1 || !["PORT", "DATABASE_DSN"].includes(key) || !value)
      throw new Error("无效 .env 配置");
    if (values[key] === undefined) values[key] = value;
  }
  const parsed = settings.parse({
    PORT: environment.PORT?.trim() || values.PORT || "8080",
    DATABASE_DSN:
      environment.DATABASE_DSN?.trim() || values.DATABASE_DSN || "./data/etf-service.sqlite",
  });
  return { port: parsed.PORT, databaseDsn: parsed.DATABASE_DSN };
};
