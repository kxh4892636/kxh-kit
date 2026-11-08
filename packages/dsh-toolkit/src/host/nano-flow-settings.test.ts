import { describe, expect, it, vi } from "vite-plus/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_NANO_FLOW_SETTINGS, type NanoFlowSettings } from "../contract.js";
import {
  createNanoFlowSettingsStore,
  nodeNanoFlowSettingsIo,
  parseNanoFlowSettings,
  type NanoFlowSettingsIo,
} from "./nano-flow-settings.js";

const memoryIo = (initial?: string): NanoFlowSettingsIo & { text(): string | undefined } => {
  let text = initial;
  return {
    async read() {
      return text;
    },
    async write(next) {
      text = next;
    },
    text() {
      return text;
    },
  };
};

describe("parseNanoFlowSettings", () => {
  it("accepts partial patches and rejects invalid values", () => {
    expect(parseNanoFlowSettings({})).toEqual(DEFAULT_NANO_FLOW_SETTINGS);
    expect(parseNanoFlowSettings({ noteMaxBytes: 2048 }).noteMaxBytes).toBe(2048);
    expect(parseNanoFlowSettings({ rotateAt: 0.5 }).rotateAt).toBe(0.5);
    expect(() => parseNanoFlowSettings(null)).toThrow(/对象/u);
    expect(() => parseNanoFlowSettings([])).toThrow(/对象/u);
    expect(() => parseNanoFlowSettings({ noteMaxBytes: "x" })).toThrow(/noteMaxBytes/u);
    expect(() => parseNanoFlowSettings({ noteMaxBytes: 0 })).toThrow(/noteMaxBytes/u);
    expect(() => parseNanoFlowSettings({ rotateAt: 0 })).toThrow(/rotateAt/u);
    expect(() => parseNanoFlowSettings({ rotateAt: 1.2 })).toThrow(/rotateAt/u);
  });

  it("ignores unknown legacy fields", () => {
    const next = parseNanoFlowSettings({
      storyMaxBytes: 1,
      noteMaxBytes: 2,
    } as unknown as NanoFlowSettings);
    expect(next.noteMaxBytes).toBe(2);
    expect("storyMaxBytes" in next).toBe(false);
  });
});

describe("settings store", () => {
  it("loads a missing file as defaults", async () => {
    const store = createNanoFlowSettingsStore(memoryIo(), { warn: vi.fn() });
    await expect(store.load()).resolves.toEqual(DEFAULT_NANO_FLOW_SETTINGS);
  });

  it("falls back to defaults for broken JSON and invalid values", async () => {
    const warn = vi.fn();
    const broken = createNanoFlowSettingsStore(memoryIo("{"), { warn });
    await expect(broken.load()).resolves.toEqual(DEFAULT_NANO_FLOW_SETTINGS);
    expect(warn).toHaveBeenCalled();

    const invalid = createNanoFlowSettingsStore(
      memoryIo(JSON.stringify({ version: 1, noteMaxBytes: -1 })),
      { warn },
    );
    await expect(invalid.load()).resolves.toEqual(DEFAULT_NANO_FLOW_SETTINGS);
  });

  it("merges and persists updates, and keeps the old value on failure", async () => {
    const io = memoryIo();
    const store = createNanoFlowSettingsStore(io, { warn: vi.fn() });
    await store.load();
    const next = await store.update({ noteMaxBytes: 4096 });
    expect(next.noteMaxBytes).toBe(4096);
    expect(String(io.text())).toContain('"noteMaxBytes": 4096');
    await expect(store.update({ noteMaxBytes: 0 })).rejects.toThrow(/noteMaxBytes/u);
    expect(store.current().noteMaxBytes).toBe(4096);
  });
});

describe("node settings io", () => {
  it("reads missing files and writes atomically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nano-flow-settings-"));
    try {
      const io = nodeNanoFlowSettingsIo(join(directory, "nano-flow.json"));
      await expect(io.read()).resolves.toBeUndefined();
      await io.write('{"version":1}\n');
      await expect(io.read()).resolves.toBe('{"version":1}\n');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
