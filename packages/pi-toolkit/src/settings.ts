/**
 * The single JSON configuration behind the whole toolkit: one file holds every
 * tool switch and every tunable, so there is exactly one place to look.
 *
 * Precedence (low to high): `getAgentDir()/pi-toolkit.json`,
 * `<cwd>/.pi/pi-toolkit.json`, `$PI_TOOLKIT_CONFIG`. Sections merge field by
 * field, so a project file can override one tunable without restating the rest.
 * The DeepSeek API key is either the literal `web.apiKey` or the environment
 * variable named by `web.apiKeyEnv`.
 *
 * Every tool starts disabled; `/toolkit` flips switches and writes them back to
 * the highest-precedence file that already exists (else the agent-dir file).
 * @module @kxh4892636/pi-toolkit/settings
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { DEFAULT_NANO_FLOW_SETTINGS, type NanoFlowSettings } from "./nano-flow/config.ts";
import { DEFAULT_EXCLUDED_DIRS } from "./skills/discover.ts";

/** Config file name in the agent dir and the project `.pi` dir. */
export const CONFIG_FILE_NAME = "pi-toolkit.json";

/** Environment variable naming an explicit config file path (highest precedence). */
export const CONFIG_PATH_ENV = "PI_TOOLKIT_CONFIG";

/** Default environment variable the DeepSeek API key is read from when `apiKey` is absent. */
export const DEFAULT_API_KEY_ENV = "DEEPSEEK_API_KEY";

/** DeepSeek's official API root; `/v1/tools/...` is appended by the clients. */
export const DEFAULT_BASE_URL = "https://api.deepseek.com";

/** Results requested per Search request; the service default. */
export const DEFAULT_SEARCH_COUNT = 10;

/** Upper bound on queries accepted by one `web_search` call. */
export const DEFAULT_SEARCH_MAX_QUERIES = 10;

/** Upper bound on merged sources returned by one `web_search` call. */
export const DEFAULT_SEARCH_MAX_RESULTS = 10;

/** Upper end of the official 600–800 character summary range. */
export const DEFAULT_SEARCH_SUMMARY_MAX_CHARS = 800;

/** Default cap on the complete rendered `web_fetch` output. */
export const DEFAULT_FETCH_MAX_OUTPUT_CHARS = 200_000;

/** Default timeout in milliseconds for one Search or Fetch request. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Default cap on a generated session name, in Unicode code points. */
export const DEFAULT_SESSION_NAME_MAX_LENGTH = 21;

/** Default ceiling for the session-naming model request. */
export const DEFAULT_SESSION_NAME_TIMEOUT_MS = 5_000;

/** Default token budget for the session-naming model request. */
export const DEFAULT_SESSION_NAME_MAX_TOKENS = 256;

/**
 * One on/off switch per bundled tool. The four switches mirror the toolkit's
 * capabilities: nested skills, session naming, the web tools, and questions to
 * the user. All default to `false`.
 */
export interface ToolToggles {
  /** Both web tools: `web_search` and `web_fetch`. */
  readonly webTools: boolean;
  /** Nested skill discovery, `$skill-name` completion, and `$` expansion. */
  readonly nestedSkills: boolean;
  /** Automatic session naming from the first user input. */
  readonly sessionName: boolean;
  /** The `ask_questions` tool for blocking, multi-question prompts. */
  readonly askQuestions: boolean;
  /** The Nano Flow workflow: prompts, tools, skills, notes sidebar. */
  readonly nanoFlow: boolean;
}

/** Toggle order used by the `/toolkit` panel. */
export const TOOL_TOGGLE_KEYS = [
  "nestedSkills",
  "sessionName",
  "webTools",
  "askQuestions",
  "nanoFlow",
] as const;

/** One switch key. */
export type ToolToggleKey = (typeof TOOL_TOGGLE_KEYS)[number];

/** Fully defaulted DeepSeek web settings. */
export interface WebSettings {
  /** Literal API key; when absent `apiKeyEnv` is read. */
  readonly apiKey: string | undefined;
  /** Environment variable holding the API key when `apiKey` is absent. */
  readonly apiKeyEnv: string;
  /** DeepSeek API root. */
  readonly baseURL: string;
  /** Results requested per Search request, 1–50. */
  readonly searchCount: number;
  /** Most queries accepted by one `web_search` call. */
  readonly searchMaxQueries: number;
  /** Most sources returned by one `web_search` call after merging. */
  readonly searchMaxResults: number;
  /** Per-source summary cap in characters. */
  readonly searchSummaryMaxChars: number;
  /** Timeout for one Search request. */
  readonly searchTimeoutMs: number;
  /** Timeout for one Fetch request. */
  readonly fetchTimeoutMs: number;
  /** Cap on the complete rendered `web_fetch` output. */
  readonly fetchMaxOutputChars: number;
}

/** Nested-skill discovery settings. */
export interface NestedSkillSettings {
  /** Directory names pruned from the discovery walk. */
  readonly excludedDirs: readonly string[];
}

/** Nano Flow settings: the 8 size caps, the rotate threshold, and the new-session default. */
export interface NanoFlowConfig extends NanoFlowSettings {
  /** Whether a new session starts in Nano Flow. `/nano-flow` Ctrl+S writes this. */
  readonly always: boolean;
}

/** Session-naming settings. */
export interface SessionNameSettings {
  /** Maximum name length in Unicode code points. */
  readonly maxLength: number;
  /** Timeout for the naming request. */
  readonly timeoutMs: number;
  /** Token budget for the naming request. */
  readonly maxTokens: number;
}

/** The complete, fully defaulted toolkit configuration. */
export interface ToolkitSettings {
  readonly tools: ToolToggles;
  readonly web: WebSettings;
  readonly nestedSkill: NestedSkillSettings;
  readonly sessionName: SessionNameSettings;
  readonly nanoFlow: NanoFlowConfig;
}

/** Every capability off: the toolkit does nothing until `/toolkit` enables it. */
export const DEFAULT_TOOLS: ToolToggles = {
  webTools: false,
  nestedSkills: false,
  sessionName: false,
  askQuestions: false,
  nanoFlow: false,
};

/** Defaults used for every field a config file leaves out. */
export const DEFAULT_SETTINGS: ToolkitSettings = {
  tools: DEFAULT_TOOLS,
  web: {
    apiKey: undefined,
    apiKeyEnv: DEFAULT_API_KEY_ENV,
    baseURL: DEFAULT_BASE_URL,
    searchCount: DEFAULT_SEARCH_COUNT,
    searchMaxQueries: DEFAULT_SEARCH_MAX_QUERIES,
    searchMaxResults: DEFAULT_SEARCH_MAX_RESULTS,
    searchSummaryMaxChars: DEFAULT_SEARCH_SUMMARY_MAX_CHARS,
    searchTimeoutMs: DEFAULT_TIMEOUT_MS,
    fetchTimeoutMs: DEFAULT_TIMEOUT_MS,
    fetchMaxOutputChars: DEFAULT_FETCH_MAX_OUTPUT_CHARS,
  },
  nestedSkill: { excludedDirs: DEFAULT_EXCLUDED_DIRS },
  nanoFlow: { ...DEFAULT_NANO_FLOW_SETTINGS, always: false },
  sessionName: {
    maxLength: DEFAULT_SESSION_NAME_MAX_LENGTH,
    timeoutMs: DEFAULT_SESSION_NAME_TIMEOUT_MS,
    maxTokens: DEFAULT_SESSION_NAME_MAX_TOKENS,
  },
};

/** Inputs for path resolution; injectable so tests never read the real home dir. */
export interface LoadSettingsOptions {
  readonly cwd: string;
  readonly agentDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** When `false`, the project `.pi` config is ignored (untrusted project). */
  readonly projectTrusted?: boolean;
}

/** Resolved settings plus the candidate paths they were merged from. */
export interface LoadedSettings {
  readonly settings: ToolkitSettings;
  /** Candidate paths in merge order (lowest precedence first). */
  readonly configPaths: readonly string[];
  /** File `/toolkit` writes toggles to. */
  readonly writePath: string;
}

/** Minimum and maximum accepted `searchCount` values from the official Search API. */
const SEARCH_COUNT_MIN = 1;
const SEARCH_COUNT_MAX = 50;

/** True for a JSON object (not an array, not null). */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * Candidate config paths in merge order (lowest precedence first). Missing
 * files are skipped by {@link loadSettings}.
 */
export const configPaths = (options: LoadSettingsOptions): string[] => {
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
 *   exist; fields are validated by {@link loadSettings}.
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
  if (!isRecord(parsed)) {
    throw new Error(`Config file ${path} must contain a JSON object`);
  }
  return parsed;
};

/**
 * Load, deep-merge, and default every config file.
 *
 * @param options - cwd, optional agent dir/env overrides, project trust.
 * @returns the fully defaulted settings and the paths used.
 * @throws when a file is unreadable or a field has the wrong type; the message
 *   names the field and every candidate path.
 */
export const loadSettings = (options: LoadSettingsOptions): LoadedSettings => {
  const env = options.env ?? process.env;
  const paths = configPaths(options);
  const merged: Record<string, unknown> = {};
  for (const path of paths) {
    const parsed = readConfigFile(path);
    if (parsed === undefined) continue;
    mergeInto(merged, parsed);
  }
  return {
    settings: parseSettings(merged, paths, env),
    configPaths: paths,
    writePath: writePathFor(paths),
  };
};

/**
 * Choose the file toggles are written to: the highest-precedence file that
 * already exists, else the agent-dir file.
 *
 * @param paths - candidate paths in merge order.
 * @returns the path `/toolkit` persists switches to.
 */
export const writePathFor = (paths: readonly string[]): string => {
  for (let index = paths.length - 1; index >= 0; index -= 1) {
    const candidate = paths[index];
    if (candidate !== undefined && existsSync(candidate)) return candidate;
  }
  return paths[0] ?? join(getAgentDir(), CONFIG_FILE_NAME);
};

/**
 * Persist the tool switches, preserving every other key in the file.
 *
 * @param path - file returned as `writePath` by {@link loadSettings}.
 * @param toggles - the switches to store.
 * @throws when the existing file is invalid JSON or cannot be written.
 */
export const saveToggles = (path: string, toggles: ToolToggles): void => {
  const existing = readConfigFile(path) ?? {};
  const currentTools = existing["tools"];
  existing["tools"] = { ...(isRecord(currentTools) ? currentTools : {}), ...toggles };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
};

/**
 * Resolve the API key or explain how to provide one.
 *
 * @param web - the resolved web settings.
 * @param paths - config paths shown in the error message.
 * @returns the non-empty API key.
 * @throws when neither `apiKey` nor its environment fallback is set.
 */
export const requireApiKey = (web: WebSettings, paths: readonly string[]): string => {
  const key = web.apiKey;
  if (key !== undefined && key.length > 0) return key;
  throw new Error(
    `DeepSeek web tools have no API key. Set "web.apiKey" in one of ${paths.join(", ")} ` +
      `or export ${web.apiKeyEnv}.`,
  );
};

/**
 * Persist the Nano Flow new-session default, preserving every other key.
 * @param path - file returned as `writePath` by {@link loadSettings}.
 * @param always - whether new sessions start in Nano Flow.
 */
export const saveNanoFlowAlways = (path: string, always: boolean): void => {
  const existing = readConfigFile(path) ?? {};
  const current = existing["nanoFlow"];
  existing["nanoFlow"] = { ...(isRecord(current) ? current : {}), always };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
};

/** Merge one parsed file into the accumulator, recursing into plain objects. */
const mergeInto = (target: Record<string, unknown>, source: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (isRecord(value) && isRecord(existing)) mergeInto(existing, value);
    else target[key] = value;
  }
};

/** Turn the merged raw JSON into validated, fully defaulted settings. */
const parseSettings = (
  merged: Record<string, unknown>,
  paths: readonly string[],
  env: NodeJS.ProcessEnv,
): ToolkitSettings => {
  const tools = section(merged, "tools", paths);
  const web = section(merged, "web", paths);
  const nestedSkill = section(merged, "nestedSkill", paths);
  const sessionName = section(merged, "sessionName", paths);
  const nanoFlow = section(merged, "nanoFlow", paths);

  const apiKeyEnv = nonEmptyString(web["apiKeyEnv"]) ?? DEFAULT_API_KEY_ENV;
  const literalKey = nonEmptyString(web["apiKey"]);
  const envKey = nonEmptyString(env[apiKeyEnv]);

  return {
    tools: {
      webTools: booleanOption(tools["webTools"], DEFAULT_TOOLS.webTools, "tools.webTools", paths),
      nestedSkills: booleanOption(
        tools["nestedSkills"],
        DEFAULT_TOOLS.nestedSkills,
        "tools.nestedSkills",
        paths,
      ),
      sessionName: booleanOption(
        tools["sessionName"],
        DEFAULT_TOOLS.sessionName,
        "tools.sessionName",
        paths,
      ),
      askQuestions: booleanOption(
        tools["askQuestions"],
        DEFAULT_TOOLS.askQuestions,
        "tools.askQuestions",
        paths,
      ),
      nanoFlow: booleanOption(tools["nanoFlow"], DEFAULT_TOOLS.nanoFlow, "tools.nanoFlow", paths),
    },
    web: {
      apiKey: literalKey ?? envKey,
      apiKeyEnv,
      baseURL: resolveBaseURL(web["baseURL"], paths),
      searchCount: boundedInteger(
        web["searchCount"],
        DEFAULT_SEARCH_COUNT,
        "web.searchCount",
        SEARCH_COUNT_MIN,
        SEARCH_COUNT_MAX,
        paths,
      ),
      searchMaxQueries: positiveInteger(
        web["searchMaxQueries"],
        DEFAULT_SEARCH_MAX_QUERIES,
        "web.searchMaxQueries",
        paths,
      ),
      searchMaxResults: positiveInteger(
        web["searchMaxResults"],
        DEFAULT_SEARCH_MAX_RESULTS,
        "web.searchMaxResults",
        paths,
      ),
      searchSummaryMaxChars: positiveInteger(
        web["searchSummaryMaxChars"],
        DEFAULT_SEARCH_SUMMARY_MAX_CHARS,
        "web.searchSummaryMaxChars",
        paths,
      ),
      searchTimeoutMs: positiveInteger(
        web["searchTimeoutMs"],
        DEFAULT_TIMEOUT_MS,
        "web.searchTimeoutMs",
        paths,
      ),
      fetchTimeoutMs: positiveInteger(
        web["fetchTimeoutMs"],
        DEFAULT_TIMEOUT_MS,
        "web.fetchTimeoutMs",
        paths,
      ),
      fetchMaxOutputChars: positiveInteger(
        web["fetchMaxOutputChars"],
        DEFAULT_FETCH_MAX_OUTPUT_CHARS,
        "web.fetchMaxOutputChars",
        paths,
      ),
    },
    nestedSkill: {
      excludedDirs: stringArray(
        nestedSkill["excludedDirs"],
        DEFAULT_EXCLUDED_DIRS,
        "nestedSkill.excludedDirs",
        paths,
      ),
    },
    nanoFlow: {
      always: booleanOption(nanoFlow["always"], false, "nanoFlow.always", paths),
      specMaxBytes: positiveInteger(
        nanoFlow["specMaxBytes"],
        DEFAULT_NANO_FLOW_SETTINGS.specMaxBytes,
        "nanoFlow.specMaxBytes",
        paths,
      ),
      noteMaxBytes: positiveInteger(
        nanoFlow["noteMaxBytes"],
        DEFAULT_NANO_FLOW_SETTINGS.noteMaxBytes,
        "nanoFlow.noteMaxBytes",
        paths,
      ),
      noteDescriptionMaxChars: positiveInteger(
        nanoFlow["noteDescriptionMaxChars"],
        DEFAULT_NANO_FLOW_SETTINGS.noteDescriptionMaxChars,
        "nanoFlow.noteDescriptionMaxChars",
        paths,
      ),
      contextMaxBytes: positiveInteger(
        nanoFlow["contextMaxBytes"],
        DEFAULT_NANO_FLOW_SETTINGS.contextMaxBytes,
        "nanoFlow.contextMaxBytes",
        paths,
      ),
      questionMaxBytes: positiveInteger(
        nanoFlow["questionMaxBytes"],
        DEFAULT_NANO_FLOW_SETTINGS.questionMaxBytes,
        "nanoFlow.questionMaxBytes",
        paths,
      ),
      adrMaxBytes: positiveInteger(
        nanoFlow["adrMaxBytes"],
        DEFAULT_NANO_FLOW_SETTINGS.adrMaxBytes,
        "nanoFlow.adrMaxBytes",
        paths,
      ),
      workflowMaxBytes: positiveInteger(
        nanoFlow["workflowMaxBytes"],
        DEFAULT_NANO_FLOW_SETTINGS.workflowMaxBytes,
        "nanoFlow.workflowMaxBytes",
        paths,
      ),
      guideMaxBytes: positiveInteger(
        nanoFlow["guideMaxBytes"],
        DEFAULT_NANO_FLOW_SETTINGS.guideMaxBytes,
        "nanoFlow.guideMaxBytes",
        paths,
      ),
      rotateAt: ratioOption(
        nanoFlow["rotateAt"],
        DEFAULT_NANO_FLOW_SETTINGS.rotateAt,
        "nanoFlow.rotateAt",
        paths,
      ),
    },
    sessionName: {
      maxLength: positiveInteger(
        sessionName["maxLength"],
        DEFAULT_SESSION_NAME_MAX_LENGTH,
        "sessionName.maxLength",
        paths,
      ),
      timeoutMs: positiveInteger(
        sessionName["timeoutMs"],
        DEFAULT_SESSION_NAME_TIMEOUT_MS,
        "sessionName.timeoutMs",
        paths,
      ),
      maxTokens: positiveInteger(
        sessionName["maxTokens"],
        DEFAULT_SESSION_NAME_MAX_TOKENS,
        "sessionName.maxTokens",
        paths,
      ),
    },
  };
};

/** Read one top-level config section; an absent section is empty. */
const section = (
  merged: Record<string, unknown>,
  name: string,
  paths: readonly string[],
): Record<string, unknown> => {
  const value = merged[name];
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error(`Config ${name} must be a JSON object (from ${paths.join(", ")})`);
  }
  return value;
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
      `Config web.baseURL must be an absolute http(s) URL, got ${JSON.stringify(raw)} ${source}`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Config web.baseURL must use http or https, got ${url.protocol} ${source}`);
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new Error(`Config web.baseURL must not include a query string or fragment ${source}`);
  }
  const path = url.pathname.replace(/\/+$/u, "");
  if (/(^|\/)anthropic(?:\/|$)/iu.test(path)) {
    throw new Error(
      `Config web.baseURL ${raw} is the retired Anthropic endpoint; ` +
        `set it to ${DEFAULT_BASE_URL} for the official DeepSeek APIs ${source}.`,
    );
  }
  return `${url.origin}${path}`;
};

const nonEmptyString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const booleanOption = (
  value: unknown,
  fallback: boolean,
  name: string,
  paths: readonly string[],
): boolean => {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`Config ${name} must be a boolean (from ${paths.join(", ")})`);
  }
  return value;
};

const ratioOption = (
  value: unknown,
  fallback: number,
  name: string,
  paths: readonly string[],
): number => {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`Config ${name} must be a number in (0, 1] (from ${paths.join(", ")})`);
  }
  return value;
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

const stringArray = (
  value: unknown,
  fallback: readonly string[],
  name: string,
  paths: readonly string[],
): readonly string[] => {
  if (value === undefined) return fallback;
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error(
      `Config ${name} must be an array of non-empty strings (from ${paths.join(", ")})`,
    );
  }
  return [...value];
};

const messageOf = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
