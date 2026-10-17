/**
 * Plugin configuration: locate the DeepSeek API key, official API base and tool
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

/** DeepSeek's official API root; `/v1/tools/...` is appended by the clients. */
export const DEFAULT_BASE_URL = "https://api.deepseek.com";

/** Default number of search results when the tool omits `count`. */
export const DEFAULT_SEARCH_COUNT = 10;

/** Default cap on characters returned by one fetch. */
export const DEFAULT_FETCH_MAX_CONTENT_CHARS = 100_000;

/** Default timeout in milliseconds for one Search or Fetch request. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Minimum and maximum accepted `count` values from the official Search API. */
const SEARCH_COUNT_MIN = 1;
const SEARCH_COUNT_MAX = 50;

/** Fully defaulted configuration for one tool call. */
export interface DeepSeekWebConfig {
  readonly apiKey: string | undefined;
  readonly apiKeyEnv: string;
  readonly baseURL: string;
  readonly searchCount: number;
  readonly fetchMaxContentChars: number;
  readonly timeoutMs: number;
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
  /** When `false`, the project `.pi` config is ignored (untrusted project). */
  readonly projectTrusted?: boolean;
}

/**
 * Candidate config paths in merge order (lowest precedence first). Missing
 * files are skipped by {@link loadConfig}, so the returned list is also the
 * diagnostic list shown when a key is missing.
 */
export const configPaths = (options: LoadConfigOptions): string[] => {
  const env = options.env ?? process.env;
  const agentDir = options.agentDir ?? getAgentDir();
  const paths = [join(resolve(agentDir), CONFIG_FILE_NAME)];
  if (options.projectTrusted !== false) {
    paths.push(join(resolve(options.cwd), CONFIG_DIR_NAME, CONFIG_FILE_NAME));
  }
  const override = env[CONFIG_PATH_ENV];
  if (typeof override === "string" && override.trim().length > 0) {
    paths.push(isAbsolute(override) ? override : resolve(options.cwd, override));
  }
  return [...new Set(paths)];
};

/**
 * Read one config file.
 *
 * @param path - absolute candidate path.
 * @returns the parsed object shape, or `undefined` when the file does not
 *   exist; fields are validated by {@link loadConfig}.
 * @throws when the file exists but is not a JSON object.
 */
export const readConfigFile = (path: string): Record<string, unknown> | undefined => {
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
  return parsed as Record<string, unknown>;
};

/** Load and merge every existing config file, then apply defaults. */
export const loadConfig = (options: LoadConfigOptions): LoadedConfig => {
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
    baseURL: resolveBaseURL(merged["baseURL"], paths),
    searchCount: boundedInteger(
      merged["searchCount"],
      DEFAULT_SEARCH_COUNT,
      "searchCount",
      SEARCH_COUNT_MIN,
      SEARCH_COUNT_MAX,
      paths,
    ),
    fetchMaxContentChars: positiveInteger(
      merged["fetchMaxContentChars"],
      DEFAULT_FETCH_MAX_CONTENT_CHARS,
      "fetchMaxContentChars",
      paths,
    ),
    timeoutMs: positiveInteger(merged["timeoutMs"], DEFAULT_TIMEOUT_MS, "timeoutMs", paths),
  };
  return { config, configPaths: paths };
};

/**
 * Resolve the API key or explain how to provide one.
 *
 * @param loaded - the result of {@link loadConfig}.
 * @returns the non-empty API key.
 * @throws when neither `apiKey` nor its environment fallback is set.
 */
export const requireApiKey = (loaded: LoadedConfig): string => {
  const key = loaded.config.apiKey;
  if (key !== undefined && key.length > 0) return key;
  throw new Error(
    `DeepSeek web tools have no API key. Set "apiKey" in one of ${loaded.configPaths.join(", ")} ` +
      `or export ${loaded.config.apiKeyEnv}.`,
  );
};

/**
 * Validate and normalize the API base URL.
 *
 * @param value - configured value, if any.
 * @param paths - config paths used in error messages.
 * @returns an origin plus path without a trailing slash.
 * @throws when the value is not an absolute http(s) URL without query/hash, or
 *   when it points at the retired Anthropic-compatible endpoint.
 */
const resolveBaseURL = (value: unknown, paths: readonly string[]): string => {
  const raw = nonEmptyString(value) ?? DEFAULT_BASE_URL;
  const source = `(from ${paths.join(", ")})`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `Config baseURL must be an absolute http(s) URL, got ${JSON.stringify(raw)} ${source}`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Config baseURL must use http or https, got ${url.protocol} ${source}`);
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new Error(`Config baseURL must not include a query string or fragment ${source}`);
  }
  const path = url.pathname.replace(/\/+$/u, "");
  if (/(^|\/)anthropic(?:\/|$)/iu.test(path)) {
    throw new Error(
      `Config baseURL ${raw} is the retired Anthropic endpoint; ` +
        `set it to ${DEFAULT_BASE_URL} for the official DeepSeek APIs ${source}.`,
    );
  }
  return `${url.origin}${path}`;
};

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

const boundedInteger = (
  value: unknown,
  fallback: number,
  name: string,
  min: number,
  max: number,
  paths: readonly string[],
): number => {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `Config ${name} must be an integer between ${min} and ${max} (from ${paths.join(", ")})`,
    );
  }
  return value;
};

const messageOf = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
