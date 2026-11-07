import { describe, expect, it } from "vite-plus/test";
import { modeChoices, type ModeSnapshot } from "./selector.ts";

const checked = (snapshot: ModeSnapshot): string[] => {
  return modeChoices(snapshot)
    .filter((item) => item.label.startsWith("✓"))
    .map((item) => item.label.replace("✓ ", ""));
};

describe("modeChoices", () => {
  it("checks the global default when there is no session override", () => {
    expect(checked({ enabled: true, sessionOverride: undefined, always: true })).toEqual([
      "一直开",
    ]);
    expect(checked({ enabled: false, sessionOverride: undefined, always: false })).toEqual([
      "一直关",
    ]);
  });

  it("checks the session override when present", () => {
    expect(checked({ enabled: true, sessionOverride: true, always: false })).toEqual([
      "当前会话开",
    ]);
    expect(checked({ enabled: false, sessionOverride: false, always: true })).toEqual([
      "当前会话关",
    ]);
  });

  it("offers exactly the four choices with descriptions", () => {
    const items = modeChoices({ enabled: false, sessionOverride: undefined, always: false });
    expect(items.map((item) => item.value)).toEqual([
      "always-on",
      "always-off",
      "session-on",
      "session-off",
    ]);
    for (const item of items) expect(item.description?.length).toBeGreaterThan(0);
  });
});
