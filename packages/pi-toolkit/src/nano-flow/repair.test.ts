import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_NANO_FLOW_SETTINGS } from "./config.ts";
import { parseDocument } from "./dag.ts";
import { repairDocument, truncateDescription } from "./repair.ts";

const limits = DEFAULT_NANO_FLOW_SETTINGS;

const note = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "01",
  title: "标题",
  description: "摘要",
  status: "pending",
  blocked_by: [],
  evidence: [],
  updated_at: "2026-11-07T00:00:00.000Z",
  content: "正文",
  ...overrides,
});

describe("truncateDescription", () => {
  it("keeps short text and truncates by code point with an ellipsis", () => {
    expect(truncateDescription("短", 10)).toBe("短");
    expect(truncateDescription("😀".repeat(10), 4)).toBe("😀😀😀…");
    expect(Array.from(truncateDescription("😀".repeat(10), 4))).toHaveLength(4);
    expect(truncateDescription("abc", 0)).toBe("");
  });
});

describe("repairDocument", () => {
  it("truncates long descriptions, fills updated_at and normalizes the index", () => {
    const raw = {
      version: 1,
      index: ["01", "01", "99"],
      notes: [
        note({ description: "长".repeat(200), updated_at: "" }),
        note({ id: "02", description: "正常" }),
      ],
    };
    const { raw: repaired, changes } = repairDocument(raw, limits);
    expect(changes.length).toBeGreaterThanOrEqual(3);
    const document = parseDocument(repaired, limits);
    expect(Array.from(document.notes[0]?.description ?? "")).toHaveLength(
      limits.noteDescriptionMaxChars,
    );
    expect(document.notes[0]?.updated_at).not.toBe("");
    expect(document.index).toEqual(["01"]);
  });

  it("caps the index at indexMaxRows", () => {
    const raw = {
      version: 1,
      index: ["01", "02", "03"],
      notes: [note(), note({ id: "02" }), note({ id: "03" })],
    };
    const { raw: repaired } = repairDocument(raw, { ...limits, indexMaxRows: 2 });
    expect(parseDocument(repaired, { ...limits, indexMaxRows: 2 }).index).toEqual(["01", "02"]);
  });

  it("leaves non-mechanical problems untouched", () => {
    const raw = {
      version: 1,
      index: [],
      notes: [note({ status: "completed", evidence: [] })],
    };
    const { changes } = repairDocument(raw, limits);
    expect(changes).toEqual([]);
    expect(() => parseDocument(raw, limits)).toThrow(/缺少 evidence/u);
  });

  it("returns the input unchanged when the shape is not repairable", () => {
    expect(repairDocument({}, limits)).toEqual({ raw: {}, changes: [] });
    expect(repairDocument("x", limits)).toEqual({ raw: "x", changes: [] });
  });
});
