import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveBeatStatus, guard, hasErrors, minutesBetween, upcoming } from "./guard.js";
import type { Beat, StoryBundle, World } from "./model.js";
import { readWorld } from "./store.js";

const beat = (over: Partial<Beat> = {}): Beat => ({
  id: "T1",
  title: "测试节点",
  opensAt: "2026-11-01T10:00:00+08:00",
  expiresAt: "2026-11-01T11:00:00+08:00",
  status: "待命",
  ...over,
});

const at = (iso: string) => Date.parse(iso);

describe("deriveBeatStatus", () => {
  it("before the window is 待命", () => {
    expect(deriveBeatStatus(beat(), at("2026-11-01T09:00:00+08:00"))).toBe("待命");
  });

  it("inside the window is 开窗", () => {
    expect(deriveBeatStatus(beat(), at("2026-11-01T10:30:00+08:00"))).toBe("开窗");
  });

  it("after the window is 已过期", () => {
    expect(deriveBeatStatus(beat(), at("2026-11-01T11:00:00+08:00"))).toBe("已过期");
  });

  it("a finished beat stays finished, never expires", () => {
    expect(deriveBeatStatus(beat({ status: "已完成" }), at("2026-12-01T00:00:00+08:00"))).toBe(
      "已完成",
    );
  });
});

describe("time helpers", () => {
  it("measures minutes forward", () => {
    expect(minutesBetween("2026-11-01T10:00:00+08:00", "2026-11-01T10:45:00+08:00")).toBe(45);
  });

  it("lists only beats inside the horizon", () => {
    const now = at("2026-11-01T09:00:00+08:00");
    const soon = upcoming(
      [
        beat(),
        beat({
          id: "T2",
          opensAt: "2026-11-20T10:00:00+08:00",
          expiresAt: "2026-11-20T11:00:00+08:00",
        }),
      ],
      now,
      48,
    );
    expect(soon.map((b) => b.id)).toEqual(["T1"]);
  });
});

async function loadMigrated(): Promise<{ bundle: StoryBundle; chapters: string[] } | null> {
  const root = path.resolve(__dirname, "../../../.story/mama-story");
  try {
    const state = JSON.parse(await fs.readFile(path.join(root, "story.json"), "utf8"));
    const clock = JSON.parse(await fs.readFile(path.join(root, "clock.json"), "utf8"));
    const beats = JSON.parse(await fs.readFile(path.join(root, "beats.json"), "utf8"));
    const foreshadows = JSON.parse(await fs.readFile(path.join(root, "foreshadows.json"), "utf8"));
    const chapters = (await fs.readdir(path.join(root, "chapters")))
      .filter((n) => n.endsWith(".md"))
      .sort();
    const world: World = await readWorld(root);
    return {
      bundle: { id: "mama-story", root, state, clock, beats, foreshadows, world },
      chapters,
    };
  } catch {
    return null;
  }
}

describe("guard on the migrated story", () => {
  it("reports no errors", async () => {
    const loaded = await loadMigrated();
    if (!loaded) return; // fixture not migrated in this checkout
    const issues = guard(loaded);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.map((e) => `${e.code}: ${e.message}`)).toEqual([]);
    expect(hasErrors(issues)).toBe(false);
  });
});
