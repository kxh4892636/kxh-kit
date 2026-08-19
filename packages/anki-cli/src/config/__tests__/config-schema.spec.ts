import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config-schema";

const baseGlobals = { readOnly: false, debug: false, compact: false };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadConfig", () => {
  it("全部默认值", () => {
    const config = loadConfig({}, baseGlobals);
    expect(config.ankiConnectUrl).toBe("http://localhost:8765");
    expect(config.ankiConnectApiVersion).toBe(6);
    expect(config.ankiConnectTimeout).toBe(5000);
    expect(config.ankiConnectApiKey).toBeUndefined();
    expect(config.readOnly).toBe(false);
    expect(config.logLevel).toBe("info");
  });

  it("env 覆盖", () => {
    const config = loadConfig(
      {
        ANKI_CONNECT_URL: "http://localhost:9999",
        ANKI_CONNECT_API_KEY: "key-1",
        ANKI_CONNECT_API_VERSION: "7",
        ANKI_CONNECT_TIMEOUT: "3000",
        LOG_LEVEL: "debug",
      },
      baseGlobals,
    );
    expect(config.ankiConnectUrl).toBe("http://localhost:9999");
    expect(config.ankiConnectApiKey).toBe("key-1");
    expect(config.ankiConnectApiVersion).toBe(7);
    expect(config.ankiConnectTimeout).toBe(3000);
    expect(config.logLevel).toBe("debug");
  });

  it("READ_ONLY env 支持 true/1", () => {
    expect(loadConfig({ READ_ONLY: "true" }, baseGlobals).readOnly).toBe(true);
    expect(loadConfig({ READ_ONLY: "1" }, baseGlobals).readOnly).toBe(true);
    expect(loadConfig({ READ_ONLY: "false" }, baseGlobals).readOnly).toBe(false);
  });

  it("CLI 全局选项覆盖 env", () => {
    const config = loadConfig(
      { ANKI_CONNECT_URL: "http://localhost:9999" },
      { ...baseGlobals, ankiConnect: "http://localhost:1111", readOnly: true },
    );
    expect(config.ankiConnectUrl).toBe("http://localhost:1111");
    expect(config.readOnly).toBe(true);
  });

  it("非法 URL 抛 ZodError", () => {
    expect(() => loadConfig({ ANKI_CONNECT_URL: "not-a-url" }, baseGlobals)).toThrow();
  });
});
