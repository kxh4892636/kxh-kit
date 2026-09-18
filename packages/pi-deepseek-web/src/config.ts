/**
 * Plugin configuration: locate the DeepSeek API key, endpoint, model and tool
 * limits from user/project JSON files, then resolve them into one fully
 * defaulted value the tools can use.
 *
 * Precedence (low to high): `getAgentDir()/pi-deepseek-web.json`,
 * `<cwd>/.pi/pi-deepseek-web.json`, `$PI_DEEPSEEK_WEB_CONFIG`. The API key is
 * either the config `apiKey` or the environment variable named by `apiKeyEnv`.
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

/** Config file name in the agent dir and the project `.pi` dir. */
export const CONFIG_FILE_NAME = "pi-deepseek-web.json";

/** Environment variable naming an explicit config file path (highest precedence). */
export const CONFIG_PATH_ENV = "PI_DEEPSEEK_WEB_CONFIG";

/** Default environment variable the API key is read from when `apiKey` is absent. */
export const DEFAULT_API_KEY_ENV = "DEEPSEEK_API_KEY";

/** DeepSeek's Anthropic-compatible Messages base; `/messages` is appended. */
export const DEFAULT_BASE_URL = "https://api.deepseek.com/anthropic/v1";

/** Anthropic-format model name enabled for the native web-search tool. */
export const DEFAULT_MODEL = "deepseek-v4-flash";

/** `anthropic-version` header value. */
export const DEFAULT_API_VERSION = "2023-06-01";

/** Upper bound on generated tokens for one search request. */
export const DEFAULT_MAX_TOKENS = 4096;

/** Maximum native `web_search` server-tool uses per request. */
export const DEFAULT_MAX_USES = 5;

/** Maximum response body size in bytes for one fetch. */
export const DEFAULT_FETCH_MAX_RESPONSE_BYTES = 5_000_000;

/** Maximum decoded body length in characters for one fetch. */
export const DEFAULT_FETCH_MAX_BODY_CHARS = 100_000;

/** Default fetch timeout in milliseconds. */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/** JSON shape accepted from a config file. Every field is optional. */
export interface DeepSeekWebConfigFile {
  apiKey?: string;
  apiKeyEnv?: string;
  baseURL?: string;
  model?: string;
  apiVersion?: string;
  maxTokens?: number;
  maxUses?: number;
  fetchMaxResponseBytes?: number;
  fetchMaxBodyChars?: number;
  fetchTimeoutMs?: number;
}

/** Fully defaulted configuration for one tool call. */
export interface DeepSeekWebConfig {
  readonly apiKey: string | undefined;
  readonly apiKeyEnv: string;
  readonly baseURL: string;
  readonly model: string;
  readonly apiVersion: string;
  readonly maxTokens: number;
  readonly maxUses: number;
  readonly fetchMaxResponseBytes: number;
  readonly fetchMaxBodyChars: number;
  readonly fetchTimeoutMs: number;
}

/** Resolved config plus the candidate paths it was merged from. */
export interface LoadedConfig {
  readonly config: DeepSeekWebConfig;
  readonly configPaths: readonly string[];
}

/** Inputs for path resolution; injectable so tests never read the real home dir. */
export interface LoadConfigOptions {
  readonly cwd: string;
  readonly agentDir?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Candidate config paths in merge order (lowest precedence first). Missing
 * files are skipped by {@link loadConfig}, so the returned list is also the
 * diagnostic list shown when a key is missing.
 */
export function configPaths(options: LoadConfigOptions): string[] {
  const env = options.env ?? process.env;
  const agentDir = options.agentDir ?? getAgentDir();
  const paths = [
    join(resolve(agentDir), CONFIG_FILE_NAME),
    join(resolve(options.cwd), CONFIG_DIR_NAME, CONFIG_FILE_NAME),
  ];
  const override = env[CONFIG_PATH_ENV];
  if (typeof override === "string" && override.trim().length > 0) {
    paths.push(isAbsolute(override) ? override : resolve(options.cwd, override));
  }
  return [...new Set(paths)];
}

/**
 * Read one config file.
 *
 * @param path - absolute candidate path.
 * @returns the parsed object, or `undefined` when the file does not exist.
 * @throws when the file exists but is not a JSON object.
 */
export function readConfigFile(path: string): DeepSeekWebConfigFile | undefined {
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Config file ${path} is not valid JSON: ${messageOf(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Config file ${path} must contain a JSON object`);
  }
  return parsed as DeepSeekWebConfigFile;
}

/** Load and merge every existing config file, then apply defaults. */
export function loadConfig(options: LoadConfigOptions): LoadedConfig {
  const env = options.env ?? process.env;
  const paths = configPaths(options);
  const merged: Record<string, unknown> = {};
  for (const path of paths) {
    const parsed = readConfigFile(path);
    if (parsed === undefined) continue;
    Object.assign(merged, parsed);
  }

  const apiKeyEnv = nonEmptyString(merged["apiKeyEnv"]) ?? DEFAULT_API_KEY_ENV;
  const literalKey = nonEmptyString(merged["apiKey"]);
  const envKey = nonEmptyString(env[apiKeyEnv]);
  const config: DeepSeekWebConfig = {
    apiKey: literalKey ?? envKey,
    apiKeyEnv,
    baseURL: nonEmptyString(merged["baseURL"]) ?? DEFAULT_BASE_URL,
    model: nonEmptyString(merged["model"]) ?? DEFAULT_MODEL,
    apiVersion: nonEmptyString(merged["apiVersion"]) ?? DEFAULT_API_VERSION,
    maxTokens: positiveInteger(merged["maxTokens"], DEFAULT_MAX_TOKENS, "maxTokens", paths),
    maxUses: positiveInteger(merged["maxUses"], DEFAULT_MAX_USES, "maxUses", paths),
    fetchMaxResponseBytes: positiveInteger(
      merged["fetchMaxResponseBytes"],
      DEFAULT_FETCH_MAX_RESPONSE_BYTES,
      "fetchMaxResponseBytes",
      paths,
    ),
    fetchMaxBodyChars: positiveInteger(
      merged["fetchMaxBodyChars"],
      DEFAULT_FETCH_MAX_BODY_CHARS,
      "fetchMaxBodyChars",
      paths,
    ),
    fetchTimeoutMs: positiveInteger(
      merged["fetchTimeoutMs"],
      DEFAULT_FETCH_TIMEOUT_MS,
      "fetchTimeoutMs",
      paths,
    ),
  };
  return { config, configPaths: paths };
}

/**
 * Resolve the API key or explain how to provide one.
 *
 * @param loaded - the result of {@link loadConfig}.
 * @returns the non-empty API key.
 * @throws when neither `apiKey` nor its environment fallback is set.
 */
export function requireApiKey(loaded: LoadedConfig): string {
  const key = loaded.config.apiKey;
  if (key !== undefined && key.length > 0) return key;
  throw new Error(
    `DeepSeek web search has no API key. Set "apiKey" in one of ${loaded.configPaths.join(", ")} ` +
      `or export ${loaded.config.apiKeyEnv}.`,
  );
}

const nonEmptyString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const positiveInteger = (
  value: unknown,
  fallback: number,
  name: string,
  paths: readonly string[],
): number => {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`Config ${name} must be a positive integer (from ${paths.join(", ")})`);
  }
  return value;
};

const messageOf = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
