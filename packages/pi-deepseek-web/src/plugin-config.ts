import { readFile } from "node:fs/promises";
import { join } from "node:path";

const CONFIG_FILE_NAME = "pi-deepseek-web.json";

const SEARCH_DEFAULTS = {
  apiKeyEnv: "DEEPSEEK_API_KEY",
  baseURL: "https://api.deepseek.com/anthropic",
  model: "deepseek-v4-flash",
  apiVersion: "2023-06-01",
  maxTokens: 4096,
  maxUses: 5,
  timeoutMs: 30_000,
  maxResults: 8,
} as const;

const FETCH_DEFAULTS = {
  timeoutMs: 30_000,
  maxResponseBytes: 5_000_000,
  maxBodyChars: 100_000,
  maxOutputChars: 200_000,
  maxRedirects: 5,
} as const;

const SEARCH_FIELDS = new Set([
  "apiKey",
  "apiKeyEnv",
  "baseURL",
  "model",
  "apiVersion",
  "maxTokens",
  "maxUses",
  "timeoutMs",
  "maxResults",
]);
const FETCH_FIELDS = new Set([
  "timeoutMs",
  "maxResponseBytes",
  "maxBodyChars",
  "maxOutputChars",
  "maxRedirects",
]);

export interface SearchConfig {
  readonly apiKey: string;
  readonly apiKeyEnv: string;
  readonly baseURL: string;
  readonly model: string;
  readonly apiVersion: string;
  readonly maxTokens: number;
  readonly maxUses: number;
  readonly timeoutMs: number;
  readonly maxResults: number;
}

export interface FetchConfig {
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly maxBodyChars: number;
  readonly maxOutputChars: number;
  readonly maxRedirects: number;
}

export interface PluginConfig {
  readonly search: Readonly<SearchConfig>;
  readonly fetch: Readonly<FetchConfig>;
}

interface ConfigLoaderOptions {
  readonly agentDir: string;
  readonly readText?: (path: string) => Promise<string>;
  readonly readEnvironment?: (name: string) => string | undefined;
}

export interface ConfigLoader {
  readonly path: string;
  readonly load: () => Promise<PluginConfig>;
}

type JsonObject = Record<string, unknown>;

const configurationError = (field: string, reason: string): Error =>
  new Error(`pi-deepseek-web configuration error at ${field}: ${reason}`);

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireObject = (value: unknown, field: string): JsonObject => {
  if (!isJsonObject(value)) {
    throw configurationError(field, "expected an object");
  }
  return value;
};

const rejectUnknownFields = (
  value: JsonObject,
  allowed: ReadonlySet<string>,
  field: string,
): void => {
  const unknown = Object.keys(value).find((key: string): boolean => !allowed.has(key));
  if (unknown !== undefined) {
    throw configurationError(`${field}.${unknown}`, "unknown field");
  }
};

const optionalString = (value: unknown, fallback: string, field: string): string => {
  const selected = value ?? fallback;
  if (typeof selected !== "string" || selected.length === 0 || selected.trim() !== selected) {
    throw configurationError(field, "expected a non-empty string without surrounding whitespace");
  }
  return selected;
};

const optionalInteger = (
  value: unknown,
  fallback: number,
  field: string,
  minimum: number,
  maximum: number,
): number => {
  const selected = value ?? fallback;
  if (
    !Number.isInteger(selected) ||
    typeof selected !== "number" ||
    selected < minimum ||
    selected > maximum
  ) {
    throw configurationError(field, `expected an integer from ${minimum} to ${maximum}`);
  }
  return selected;
};

const parseServiceRoot = (value: unknown): string => {
  const serviceRoot = optionalString(value, SEARCH_DEFAULTS.baseURL, "search.baseURL");
  let url: URL;
  try {
    url = new URL(serviceRoot);
  } catch {
    throw configurationError("search.baseURL", "expected a valid HTTPS service root");
  }
  const normalizedPath = url.pathname.replace(/\/$/u, "");
  const containsVersionSegment = normalizedPath
    .split("/")
    .some((segment: string): boolean => segment.toLowerCase() === "v1");
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    containsVersionSegment
  ) {
    throw configurationError(
      "search.baseURL",
      "expected an HTTPS service root without credentials, query, fragment, or /v1",
    );
  }
  url.pathname = normalizedPath;
  return url.toString().replace(/\/$/u, "");
};

const parseSearchConfig = (
  raw: JsonObject,
  readEnvironment: (name: string) => string | undefined,
): Readonly<SearchConfig> => {
  rejectUnknownFields(raw, SEARCH_FIELDS, "search");
  const apiKeyEnv = optionalString(raw["apiKeyEnv"], SEARCH_DEFAULTS.apiKeyEnv, "search.apiKeyEnv");
  const literalApiKey = raw["apiKey"];
  const environmentApiKey = literalApiKey === undefined ? readEnvironment(apiKeyEnv) : undefined;
  if (literalApiKey === undefined && environmentApiKey === undefined) {
    throw configurationError("search.apiKeyEnv", "configured environment variable is missing");
  }
  const apiKey = optionalString(
    literalApiKey ?? environmentApiKey,
    "",
    literalApiKey === undefined ? "search.apiKeyEnv" : "search.apiKey",
  );
  return Object.freeze({
    apiKey,
    apiKeyEnv,
    baseURL: parseServiceRoot(raw["baseURL"]),
    model: optionalString(raw["model"], SEARCH_DEFAULTS.model, "search.model"),
    apiVersion: optionalString(raw["apiVersion"], SEARCH_DEFAULTS.apiVersion, "search.apiVersion"),
    maxTokens: optionalInteger(
      raw["maxTokens"],
      SEARCH_DEFAULTS.maxTokens,
      "search.maxTokens",
      1,
      65_536,
    ),
    maxUses: optionalInteger(raw["maxUses"], SEARCH_DEFAULTS.maxUses, "search.maxUses", 1, 10),
    timeoutMs: optionalInteger(
      raw["timeoutMs"],
      SEARCH_DEFAULTS.timeoutMs,
      "search.timeoutMs",
      1,
      300_000,
    ),
    maxResults: optionalInteger(
      raw["maxResults"],
      SEARCH_DEFAULTS.maxResults,
      "search.maxResults",
      1,
      50,
    ),
  });
};

const parseFetchConfig = (raw: JsonObject): Readonly<FetchConfig> => {
  rejectUnknownFields(raw, FETCH_FIELDS, "fetch");
  return Object.freeze({
    timeoutMs: optionalInteger(
      raw["timeoutMs"],
      FETCH_DEFAULTS.timeoutMs,
      "fetch.timeoutMs",
      1,
      300_000,
    ),
    maxResponseBytes: optionalInteger(
      raw["maxResponseBytes"],
      FETCH_DEFAULTS.maxResponseBytes,
      "fetch.maxResponseBytes",
      1,
      50_000_000,
    ),
    maxBodyChars: optionalInteger(
      raw["maxBodyChars"],
      FETCH_DEFAULTS.maxBodyChars,
      "fetch.maxBodyChars",
      1,
      1_000_000,
    ),
    maxOutputChars: optionalInteger(
      raw["maxOutputChars"],
      FETCH_DEFAULTS.maxOutputChars,
      "fetch.maxOutputChars",
      1,
      1_000_000,
    ),
    maxRedirects: optionalInteger(
      raw["maxRedirects"],
      FETCH_DEFAULTS.maxRedirects,
      "fetch.maxRedirects",
      0,
      20,
    ),
  });
};

const parseConfig = (
  text: string,
  readEnvironment: (name: string) => string | undefined,
): PluginConfig => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch {
    throw configurationError("root", "invalid JSON");
  }
  const root = requireObject(decoded, "root");
  rejectUnknownFields(root, new Set(["search", "fetch"]), "root");
  if (!("search" in root)) {
    throw configurationError("search", "required field");
  }
  const search = parseSearchConfig(requireObject(root["search"], "search"), readEnvironment);
  const fetch = parseFetchConfig(
    root["fetch"] === undefined ? {} : requireObject(root["fetch"], "fetch"),
  );
  return Object.freeze({ search, fetch });
};

export const getConfigPath = (agentDir: string): string => join(agentDir, CONFIG_FILE_NAME);

export const createConfigLoader = (options: ConfigLoaderOptions): ConfigLoader => {
  const path = getConfigPath(options.agentDir);
  const readText =
    options.readText ?? ((target: string): Promise<string> => readFile(target, "utf8"));
  const readEnvironment =
    options.readEnvironment ?? ((name: string): string | undefined => process.env[name]);
  const load = async (): Promise<PluginConfig> => {
    let text: string;
    try {
      text = await readText(path);
    } catch {
      throw configurationError("root", `cannot read ${CONFIG_FILE_NAME}`);
    }
    return parseConfig(text, readEnvironment);
  };
  return Object.freeze({ path, load });
};
