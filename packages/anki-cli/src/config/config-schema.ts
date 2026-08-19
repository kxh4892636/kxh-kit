import { z } from "zod";
import type { GlobalCliOptions } from "../cli/globals";

// 配置 schema: env 名与上游 anki-mcp-server 一致(ANKI_CONNECT_* 等)。
export const configSchema = z.object({
  ankiConnectUrl: z.string().url().default("http://localhost:8765"),
  ankiConnectApiKey: z.string().optional(),
  ankiConnectApiVersion: z.coerce.number().int().positive().default(6),
  ankiConnectTimeout: z.coerce.number().int().positive().default(5000),
  readOnly: z.boolean().default(false),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AnkiConfig = z.infer<typeof configSchema>;

// READ_ONLY env: "true"/"1" → true, 其余视为 false(与上游一致)。
const parseReadOnly = (value: string | undefined): boolean => value === "true" || value === "1";

// CLI 选项覆盖 env; 未提供时交由 schema 默认值兜底。
// 注: noPropertyAccessFromIndexSignature 要求 env 用下标访问。
export const loadConfig = (env: NodeJS.ProcessEnv, globals: GlobalCliOptions): AnkiConfig =>
  configSchema.parse({
    ankiConnectUrl: globals.ankiConnect ?? env["ANKI_CONNECT_URL"],
    ankiConnectApiKey: env["ANKI_CONNECT_API_KEY"],
    ankiConnectApiVersion: env["ANKI_CONNECT_API_VERSION"],
    ankiConnectTimeout: env["ANKI_CONNECT_TIMEOUT"],
    readOnly: globals.readOnly || parseReadOnly(env["READ_ONLY"]),
    logLevel: env["LOG_LEVEL"],
  });
