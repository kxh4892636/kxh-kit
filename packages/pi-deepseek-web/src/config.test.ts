import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONFIG_FILE_NAME,
  CONFIG_PATH_ENV,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MODEL,
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
    expect(config.model).toBe(DEFAULT_MODEL);
    expect(config.apiKeyEnv).toBe(DEFAULT_API_KEY_ENV);
    expect(config.fetchTimeoutMs).toBe(DEFAULT_FETCH_TIMEOUT_MS);
    expect(config.apiKey).toBeUndefined();
  });

  it("lets project config override global config", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeFileSync(
      join(agentDir, CONFIG_FILE_NAME),
      JSON.stringify({ model: "global-model", maxUses: 2 }),
    );
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    writeFileSync(join(cwd, ".pi", CONFIG_FILE_NAME), JSON.stringify({ model: "project-model" }));
    const { config } = loadConfig({ cwd, agentDir, env: {} });
    expect(config.model).toBe("project-model");
    expect(config.maxUses).toBe(2);
  });

  it("prefers apiKey over the environment fallback", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeFileSync(join(agentDir, CONFIG_FILE_NAME), JSON.stringify({ apiKey: "literal" }));
    const { config } = loadConfig({ cwd, agentDir, env: { [DEFAULT_API_KEY_ENV]: "from-env" } });
    expect(config.apiKey).toBe("literal");
  });

  it("falls back to the environment variable named by apiKeyEnv", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeFileSync(join(agentDir, CONFIG_FILE_NAME), JSON.stringify({ apiKeyEnv: "MY_KEY" }));
    const { config } = loadConfig({ cwd, agentDir, env: { MY_KEY: "from-custom-env" } });
    expect(config.apiKey).toBe("from-custom-env");
  });

  it("rejects a non-positive or non-integer limit", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeFileSync(join(agentDir, CONFIG_FILE_NAME), JSON.stringify({ maxUses: 0 }));
    expect(() => loadConfig({ cwd, agentDir, env: {} })).toThrow(/maxUses/u);
  });

  it("reads an explicit config path from the environment", () => {
    const cwd = tempDir();
    const override = join(tempDir(), "explicit.json");
    writeFileSync(override, JSON.stringify({ model: "explicit-model" }));
    const { config, configPaths: paths } = loadConfig({
      cwd,
      agentDir: tempDir(),
      env: { [CONFIG_PATH_ENV]: override },
    });
    expect(config.model).toBe("explicit-model");
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
