import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

const emptyFile = (): string => join(mkdtempSync(join(tmpdir(), "music-env-")), ".env");

describe("loadConfig", () => {
  it("falls back to the local defaults", () => {
    const config = loadConfig(emptyFile(), {});
    expect(config.port).toBe(5210);
    expect(config.clientDir).toBe("./dist/client");
    expect(config.musicRoot).toContain("musopen-flac");
  });

  it("reads the env file", () => {
    const file = emptyFile();
    writeFileSync(file, "PORT=5300\nMUSIC_ROOT=D:\\music\nTRACKS_FILE=./x.json\n", "utf8");
    const config = loadConfig(file, {});
    expect(config.port).toBe(5300);
    expect(config.musicRoot).toBe("D:\\music");
    expect(config.tracksFile).toBe("./x.json");
  });

  it("lets the process environment win over the file", () => {
    const file = emptyFile();
    writeFileSync(file, "PORT=5300\n", "utf8");
    expect(loadConfig(file, { PORT: "5400" }).port).toBe(5400);
  });

  it("rejects a nonsense port", () => {
    expect(() => loadConfig(emptyFile(), { PORT: "0" })).toThrow();
    expect(() => loadConfig(emptyFile(), { PORT: "http" })).toThrow();
  });

  it("ignores unknown keys and comments", () => {
    const file = emptyFile();
    writeFileSync(file, "# 端口\nPATH=/nope\nPORT=5211\n", "utf8");
    expect(loadConfig(file, {}).port).toBe(5211);
  });
});
