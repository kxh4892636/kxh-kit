import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  CONFIG_FILE_NAME,
  CONFIG_PATH_ENV,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_FETCH_MAX_CONTENT_CHARS,
  DEFAULT_SEARCH_COUNT,
  DEFAULT_TIMEOUT_MS,
  configPaths,
  loadConfig,
  readConfigFile,
  requireApiKey,
} from "./config.ts";

const created: string[] = [];

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-dsw-"));
  created.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const writeConfig = (agentDir: string, config: Record<string, unknown>): void => {
  writeFileSync(join(agentDir, CONFIG_FILE_NAME), JSON.stringify(config));
};

const writeProjectConfig = (cwd: string, config: Record<string, unknown>): void => {
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(join(cwd, ".pi", CONFIG_FILE_NAME), JSON.stringify(config));
};

describe("configPaths", () => {
  it("orders global, project, then env override", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    const paths = configPaths({ cwd, agentDir, env: { [CONFIG_PATH_ENV]: "override.json" } });
    expect(paths).toEqual([
      join(agentDir, CONFIG_FILE_NAME),
      join(cwd, ".pi", CONFIG_FILE_NAME),
      join(cwd, "override.json"),
    ]);
  });
});

describe("readConfigFile", () => {
  it("returns undefined for a missing file", () => {
    expect(readConfigFile(join(tempDir(), "missing.json"))).toBeUndefined();
  });

  it("throws for invalid JSON and non-object roots", () => {
    const dir = tempDir();
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{ not json");
    expect(() => readConfigFile(bad)).toThrow(/not valid JSON/u);
    const array = join(dir, "array.json");
    writeFileSync(array, "[]");
    expect(() => readConfigFile(array)).toThrow(/JSON object/u);
  });
});

describe("loadConfig", () => {
  it("applies defaults when no file exists", () => {
    const { config } = loadConfig({ cwd: tempDir(), agentDir: tempDir(), env: {} });
    expect(config.baseURL).toBe(DEFAULT_BASE_URL);
    expect(config.searchCount).toBe(DEFAULT_SEARCH_COUNT);
    expect(config.fetchMaxContentChars).toBe(DEFAULT_FETCH_MAX_CONTENT_CHARS);
    expect(config.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(config.apiKeyEnv).toBe(DEFAULT_API_KEY_ENV);
    expect(config.apiKey).toBeUndefined();
  });

  it("lets project config override global config", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeConfig(agentDir, { searchCount: 3, fetchMaxContentChars: 2_000 });
    writeProjectConfig(cwd, { searchCount: 5 });
    const { config } = loadConfig({ cwd, agentDir, env: {} });
    expect(config.searchCount).toBe(5);
    expect(config.fetchMaxContentChars).toBe(2_000);
  });

  it("prefers apiKey over the environment fallback", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeConfig(agentDir, { apiKey: "literal" });
    const { config } = loadConfig({ cwd, agentDir, env: { [DEFAULT_API_KEY_ENV]: "from-env" } });
    expect(config.apiKey).toBe("literal");
  });

  it("falls back to the environment variable named by apiKeyEnv", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeConfig(agentDir, { apiKeyEnv: "MY_KEY" });
    const { config } = loadConfig({ cwd, agentDir, env: { MY_KEY: "from-custom-env" } });
    expect(config.apiKey).toBe("from-custom-env");
  });

  it("rejects invalid search counts", () => {
    const cwd = tempDir();
    for (const searchCount of [0, 51, 1.5]) {
      const agentDir = tempDir();
      writeConfig(agentDir, { searchCount });
      expect(() => loadConfig({ cwd, agentDir, env: {} })).toThrow(/searchCount/u);
    }
  });

  it("rejects invalid fetch and timeout limits", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    for (const value of [0, 1.5, "x"]) {
      writeConfig(agentDir, { fetchMaxContentChars: value });
      expect(() => loadConfig({ cwd, agentDir, env: {} })).toThrow(/fetchMaxContentChars/u);
    }
    for (const value of [0, 1.5, "x"]) {
      writeConfig(agentDir, { timeoutMs: value });
      expect(() => loadConfig({ cwd, agentDir, env: {} })).toThrow(/timeoutMs/u);
    }
  });

  it("ignores fields from the retired Anthropic client", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeConfig(agentDir, { model: "deepseek-v4-flash", maxUses: 3, apiVersion: "2023-06-01" });
    const { config } = loadConfig({ cwd, agentDir, env: {} });
    expect(config.searchCount).toBe(DEFAULT_SEARCH_COUNT);
    expect(config.baseURL).toBe(DEFAULT_BASE_URL);
  });

  it("normalizes a trailing slash and keeps a versioned base", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeConfig(agentDir, { baseURL: "https://api.deepseek.com/v1/" });
    expect(loadConfig({ cwd, agentDir, env: {} }).config.baseURL).toBe(
      "https://api.deepseek.com/v1",
    );
  });

  it("rejects the retired Anthropic endpoint, invalid protocols, and query/hash", () => {
    const cwd = tempDir();
    const cases: Array<[string, RegExp]> = [
      ["https://api.deepseek.com/anthropic/v1", /retired Anthropic endpoint/u],
      ["api.deepseek.com", /absolute/u],
      ["ftp://api.deepseek.com", /http or https/u],
      ["https://api.deepseek.com?v=1", /query string or fragment/u],
      ["https://api.deepseek.com#v1", /query string or fragment/u],
    ];
    for (const [baseURL, pattern] of cases) {
      const agentDir = tempDir();
      writeConfig(agentDir, { baseURL });
      expect(() => loadConfig({ cwd, agentDir, env: {} })).toThrow(pattern);
    }
  });

  it("ignores the project config when the project is untrusted", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeProjectConfig(cwd, { searchCount: 7 });
    const { config } = loadConfig({ cwd, agentDir, env: {}, projectTrusted: false });
    expect(config.searchCount).toBe(DEFAULT_SEARCH_COUNT);
  });

  it("reads an explicit config path from the environment with higher precedence", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeConfig(agentDir, { searchCount: 3 });
    const override = join(tempDir(), "explicit.json");
    writeFileSync(override, JSON.stringify({ searchCount: 7 }));
    const { config, configPaths: paths } = loadConfig({
      cwd,
      agentDir,
      env: { [CONFIG_PATH_ENV]: override },
    });
    expect(config.searchCount).toBe(7);
    expect(paths).toContain(override);
  });
});

describe("requireApiKey", () => {
  it("returns the key when present", () => {
    const loaded = loadConfig({
      cwd: tempDir(),
      agentDir: tempDir(),
      env: { [DEFAULT_API_KEY_ENV]: "k" },
    });
    expect(requireApiKey(loaded)).toBe("k");
  });

  it("explains the config paths and env var when missing", () => {
    const loaded = loadConfig({ cwd: tempDir(), agentDir: tempDir(), env: {} });
    expect(() => requireApiKey(loaded)).toThrow(new RegExp(`${DEFAULT_API_KEY_ENV}`, "u"));
    expect(() => requireApiKey(loaded)).toThrow(new RegExp(CONFIG_FILE_NAME, "u"));
  });
});

describe("baseURL errors", () => {
  it("names the config paths in every error", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeConfig(agentDir, { baseURL: "ftp://api.deepseek.com" });
    expect(() => loadConfig({ cwd, agentDir, env: {} })).toThrow(new RegExp(CONFIG_FILE_NAME, "u"));
  });
});
