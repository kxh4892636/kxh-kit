import { readFile } from "node:fs/promises";
import { join } from "node:path";

const CONFIG_FILE_NAME = "pi-nano-subagent.json";
const CONFIG_FIELDS = new Set(["maxConcurrency"]);

export const DEFAULT_MAX_CONCURRENCY = 5;
export const MAX_CONCURRENCY = 64;

export interface SubagentConfig {
  readonly maxConcurrency: number;
}

interface ConfigLoaderOptions {
  readonly agentDir: string;
  readonly readText?: (path: string) => Promise<string>;
}

export interface ConfigLoader {
  readonly path: string;
  readonly load: () => Promise<Readonly<SubagentConfig>>;
}

type JsonObject = Record<string, unknown>;

const configurationError = (field: string, reason: string): Error =>
  new Error(`pi-nano-subagent configuration error at ${field}: ${reason}`);

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMissingFileError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const parseConfig = (text: string): Readonly<SubagentConfig> => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch {
    throw configurationError("root", "invalid JSON");
  }
  if (!isJsonObject(decoded)) {
    throw configurationError("root", "expected an object");
  }
  const unknownField = Object.keys(decoded).find(
    (field: string): boolean => !CONFIG_FIELDS.has(field),
  );
  if (unknownField !== undefined) {
    throw configurationError(`root.${unknownField}`, "unknown field");
  }
  const maxConcurrency = Object.hasOwn(decoded, "maxConcurrency")
    ? decoded["maxConcurrency"]
    : DEFAULT_MAX_CONCURRENCY;
  if (
    typeof maxConcurrency !== "number" ||
    !Number.isInteger(maxConcurrency) ||
    maxConcurrency < 1 ||
    maxConcurrency > MAX_CONCURRENCY
  ) {
    throw configurationError(
      "root.maxConcurrency",
      `expected an integer from 1 to ${MAX_CONCURRENCY}`,
    );
  }
  return Object.freeze({ maxConcurrency });
};

export const getConfigPath = (agentDir: string): string => join(agentDir, CONFIG_FILE_NAME);

export const createConfigLoader = (options: ConfigLoaderOptions): ConfigLoader => {
  const path = getConfigPath(options.agentDir);
  const readText =
    options.readText ?? ((target: string): Promise<string> => readFile(target, "utf8"));
  const load = async (): Promise<Readonly<SubagentConfig>> => {
    let text: string;
    try {
      text = await readText(path);
    } catch (error: unknown) {
      if (isMissingFileError(error)) {
        return Object.freeze({ maxConcurrency: DEFAULT_MAX_CONCURRENCY });
      }
      throw configurationError("root", `cannot read ${CONFIG_FILE_NAME}`);
    }
    return parseConfig(text);
  };
  return Object.freeze({ path, load });
};
