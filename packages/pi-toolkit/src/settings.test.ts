import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { DEFAULT_ORCHESTRATOR_SETTINGS } from "./orchestrator/config.ts";
import { DEFAULT_EXCLUDED_DIRS } from "./skills/discover.ts";
import {
  CONFIG_FILE_NAME,
  CONFIG_PATH_ENV,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_FETCH_MAX_OUTPUT_CHARS,
  DEFAULT_SEARCH_COUNT,
  DEFAULT_SEARCH_MAX_QUERIES,
  DEFAULT_SEARCH_MAX_RESULTS,
  DEFAULT_SEARCH_SUMMARY_MAX_CHARS,
  DEFAULT_SESSION_NAME_MAX_LENGTH,
  DEFAULT_SESSION_NAME_MAX_TOKENS,
  DEFAULT_SESSION_NAME_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  configPaths,
  loadSettings,
  readConfigFile,
  requireApiKey,
  saveOrchestratorAlways,
  saveToggles,
  writePathFor,
} from "./settings.ts";

const created: string[] = [];

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-toolkit-settings-"));
  created.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const writeConfig = (agentDir: string, config: Record<string, unknown>): string => {
  const path = join(agentDir, CONFIG_FILE_NAME);
  writeFileSync(path, JSON.stringify(config));
  return path;
};

const writeProjectConfig = (cwd: string, config: Record<string, unknown>): string => {
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  const path = join(cwd, ".pi", CONFIG_FILE_NAME);
  writeFileSync(path, JSON.stringify(config));
  return path;
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

  it("skips the project path when the project is untrusted", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    const paths = configPaths({ cwd, agentDir, env: {}, projectTrusted: false });
    expect(paths).toEqual([join(agentDir, CONFIG_FILE_NAME)]);
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

describe("loadSettings", () => {
  it("disables every tool and applies the tunable defaults with no config", () => {
    const agentDir = tempDir();
    const { settings, writePath } = loadSettings({ cwd: tempDir(), agentDir, env: {} });
    expect(settings.tools).toEqual({
      webTools: false,
      nestedSkills: false,
      sessionName: false,
      orchestrator: false,
    });
    expect(settings.web.baseURL).toBe(DEFAULT_BASE_URL);
    expect(settings.web.apiKeyEnv).toBe(DEFAULT_API_KEY_ENV);
    expect(settings.web.apiKey).toBeUndefined();
    expect(settings.web.searchCount).toBe(DEFAULT_SEARCH_COUNT);
    expect(settings.web.searchMaxQueries).toBe(DEFAULT_SEARCH_MAX_QUERIES);
    expect(settings.web.searchMaxResults).toBe(DEFAULT_SEARCH_MAX_RESULTS);
    expect(settings.web.searchSummaryMaxChars).toBe(DEFAULT_SEARCH_SUMMARY_MAX_CHARS);
    expect(settings.web.searchTimeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(settings.web.fetchTimeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(settings.web.fetchMaxOutputChars).toBe(DEFAULT_FETCH_MAX_OUTPUT_CHARS);
    expect(settings.nestedSkill.excludedDirs).toEqual([...DEFAULT_EXCLUDED_DIRS]);
    expect(settings.sessionName).toEqual({
      maxLength: DEFAULT_SESSION_NAME_MAX_LENGTH,
      timeoutMs: DEFAULT_SESSION_NAME_TIMEOUT_MS,
      maxTokens: DEFAULT_SESSION_NAME_MAX_TOKENS,
    });
    expect(settings.orchestrator).toEqual({ ...DEFAULT_ORCHESTRATOR_SETTINGS, always: false });
    expect(writePath).toBe(join(agentDir, CONFIG_FILE_NAME));
  });

  it("merges sections field by field, with later files winning", () => {
    const agentDir = tempDir();
    const cwd = tempDir();
    writeConfig(agentDir, {
      tools: { webTools: true },
      web: { apiKey: "global-key", searchMaxResults: 5 },
    });
    writeProjectConfig(cwd, { tools: { nestedSkills: true }, web: { searchMaxResults: 3 } });
    const { settings } = loadSettings({ cwd, agentDir, env: {} });
    expect(settings.tools.webTools).toBe(true);
    expect(settings.tools.nestedSkills).toBe(true);
    expect(settings.tools.sessionName).toBe(false);
    expect(settings.web.apiKey).toBe("global-key");
    expect(settings.web.searchMaxResults).toBe(3);
  });

  it("lets the env-named file win over global and project files", () => {
    const agentDir = tempDir();
    const cwd = tempDir();
    writeConfig(agentDir, { tools: { webTools: true } });
    const override = join(cwd, "custom.json");
    writeFileSync(override, JSON.stringify({ tools: { webTools: false, sessionName: true } }));
    const { settings, configPaths: paths } = loadSettings({
      cwd,
      agentDir,
      env: { [CONFIG_PATH_ENV]: override },
    });
    expect(paths.at(-1)).toBe(override);
    expect(settings.tools.webTools).toBe(false);
    expect(settings.tools.sessionName).toBe(true);
  });

  it("resolves the API key from the literal value before the environment", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    writeConfig(agentDir, { web: { apiKey: "literal", apiKeyEnv: "MY_KEY" } });
    const literal = loadSettings({ cwd, agentDir, env: { MY_KEY: "env-key" } });
    expect(literal.settings.web.apiKey).toBe("literal");
    writeConfig(agentDir, { web: { apiKeyEnv: "MY_KEY" } });
    const fromEnv = loadSettings({ cwd, agentDir, env: { MY_KEY: "env-key" } });
    expect(fromEnv.settings.web.apiKey).toBe("env-key");
  });

  it("rejects malformed sections and fields with the field name", () => {
    const cwd = tempDir();
    const agentDir = tempDir();
    const load = (config: Record<string, unknown>): void => {
      writeConfig(agentDir, config);
      loadSettings({ cwd, agentDir, env: {} });
    };
    expect(() => load({ tools: [] })).toThrow(/tools must be a JSON object/u);
    expect(() => load({ tools: { webTools: "yes" } })).toThrow(/tools\.webTools/u);
    expect(() => load({ web: { searchCount: 0 } })).toThrow(/web\.searchCount/u);
    expect(() => load({ web: { searchCount: 51 } })).toThrow(/web\.searchCount/u);
    expect(() => load({ web: { fetchTimeoutMs: 1.5 } })).toThrow(/web\.fetchTimeoutMs/u);
    expect(() => load({ nestedSkill: { excludedDirs: ["ok", ""] } })).toThrow(
      /nestedSkill\.excludedDirs/u,
    );
    expect(() => load({ sessionName: { maxLength: 0 } })).toThrow(/sessionName\.maxLength/u);
    expect(() => load({ orchestrator: { rotateAt: 1.5 } })).toThrow(/orchestrator\.rotateAt/u);
    expect(() => load({ orchestrator: { noteMaxBytes: 0 } })).toThrow(
      /orchestrator\.noteMaxBytes/u,
    );
    expect(() => load({ orchestrator: { always: "yes" } })).toThrow(/orchestrator\.always/u);
  });

  it("rejects the retired Anthropic base URL", () => {
    const agentDir = tempDir();
    writeConfig(agentDir, { web: { baseURL: "https://api.deepseek.com/anthropic" } });
    expect(() => loadSettings({ cwd: tempDir(), agentDir, env: {} })).toThrow(/retired/u);
  });
});

describe("writePathFor", () => {
  it("picks the highest-precedence existing file, else the agent-dir file", () => {
    const agentDir = tempDir();
    const cwd = tempDir();
    const globalPath = join(agentDir, CONFIG_FILE_NAME);
    const projectPath = writeProjectConfig(cwd, {});
    expect(writePathFor([globalPath, projectPath])).toBe(projectPath);
    rmSync(projectPath);
    expect(writePathFor([globalPath, projectPath])).toBe(globalPath);
    expect(writePathFor([])).toMatch(new RegExp(`${CONFIG_FILE_NAME}$`, "u"));
  });
});

describe("saveToggles", () => {
  it("creates the file with only the switches", () => {
    const path = join(tempDir(), CONFIG_FILE_NAME);
    saveToggles(path, {
      webTools: true,
      nestedSkills: false,
      sessionName: true,
      orchestrator: false,
    });
    const written = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    expect(written["tools"]).toEqual({
      webTools: true,
      nestedSkills: false,
      sessionName: true,
      orchestrator: false,
    });
  });

  it("preserves every other key and unrelated switch", () => {
    const dir = tempDir();
    const path = writeConfig(dir, {
      tools: { webTools: true, sessionName: true },
      web: { apiKey: "k", searchCount: 4 },
    });
    saveToggles(path, {
      webTools: false,
      nestedSkills: false,
      sessionName: true,
      orchestrator: false,
    });
    const written = JSON.parse(readFileSync(path, "utf-8")) as {
      tools: Record<string, boolean>;
      web: Record<string, unknown>;
    };
    expect(written.tools).toEqual({
      webTools: false,
      nestedSkills: false,
      sessionName: true,
      orchestrator: false,
    });
    expect(written.web).toEqual({ apiKey: "k", searchCount: 4 });
  });

  it("throws when the existing file is not valid JSON", () => {
    const dir = tempDir();
    const path = join(dir, CONFIG_FILE_NAME);
    writeFileSync(path, "{ nope");
    expect(() =>
      saveToggles(path, {
        webTools: true,
        nestedSkills: true,
        sessionName: true,
        orchestrator: true,
      }),
    ).toThrow(/not valid JSON/u);
  });
});

describe("requireApiKey", () => {
  it("returns the key or explains how to provide one", () => {
    const { settings, configPaths: paths } = loadSettings({
      cwd: tempDir(),
      agentDir: tempDir(),
      env: { [DEFAULT_API_KEY_ENV]: "from-env" },
    });
    expect(requireApiKey(settings.web, paths)).toBe("from-env");
    expect(() => requireApiKey({ ...settings.web, apiKey: undefined }, paths)).toThrow(
      /no API key/u,
    );
  });
});

describe("orchestrator settings", () => {
  it("merges limits and the always flag from the JSON file", () => {
    const agentDir = tempDir();
    writeConfig(agentDir, {
      tools: { orchestrator: true },
      orchestrator: { noteMaxBytes: 2048, rotateAt: 0.5, always: true },
    });
    const { settings } = loadSettings({ cwd: tempDir(), agentDir, env: {} });
    expect(settings.tools.orchestrator).toBe(true);
    expect(settings.orchestrator.noteMaxBytes).toBe(2048);
    expect(settings.orchestrator.rotateAt).toBe(0.5);
    expect(settings.orchestrator.always).toBe(true);
    expect(settings.orchestrator.storyMaxBytes).toBe(DEFAULT_ORCHESTRATOR_SETTINGS.storyMaxBytes);
  });

  it("persists always while preserving every other key", () => {
    const dir = tempDir();
    const path = writeConfig(dir, {
      tools: { orchestrator: true },
      orchestrator: { noteMaxBytes: 2048 },
      web: { apiKey: "k" },
    });
    saveOrchestratorAlways(path, true);
    const written = JSON.parse(readFileSync(path, "utf-8")) as {
      tools: Record<string, boolean>;
      orchestrator: Record<string, unknown>;
      web: Record<string, unknown>;
    };
    expect(written.orchestrator).toEqual({ noteMaxBytes: 2048, always: true });
    expect(written.tools).toEqual({ orchestrator: true });
    expect(written.web).toEqual({ apiKey: "k" });
  });

  it("adopts the pre-merge nanoFlow names and lets the new ones win", () => {
    const legacyDir = tempDir();
    writeConfig(legacyDir, {
      tools: { nanoFlow: true },
      nanoFlow: { noteMaxBytes: 1024, always: true },
    });
    const legacy = loadSettings({ cwd: tempDir(), agentDir: legacyDir, env: {} });
    expect(legacy.settings.tools.orchestrator).toBe(true);
    expect(legacy.settings.orchestrator.noteMaxBytes).toBe(1024);
    expect(legacy.settings.orchestrator.always).toBe(true);

    const bothDir = tempDir();
    writeConfig(bothDir, {
      tools: { nanoFlow: true, orchestrator: false },
      nanoFlow: { noteMaxBytes: 1024 },
      orchestrator: { noteMaxBytes: 4096 },
    });
    const both = loadSettings({ cwd: tempDir(), agentDir: bothDir, env: {} });
    expect(both.settings.tools.orchestrator).toBe(false);
    expect(both.settings.orchestrator.noteMaxBytes).toBe(4096);
  });
});
