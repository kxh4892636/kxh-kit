import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vite-plus/test";
import { modeItems, pickMode, type ModeSnapshot } from "./selector.ts";

beforeAll(() => {
  initTheme("dark", false);
});

const checked = (snapshot: ModeSnapshot): string => {
  return (
    modeItems(snapshot)
      .filter((item) => item.label.startsWith("✓"))
      .map((item) => item.label.replace("✓ ", ""))[0] ?? ""
  );
};

describe("modeItems", () => {
  it("checks the current session state", () => {
    expect(checked({ enabled: true, always: false })).toBe("开");
    expect(checked({ enabled: false, always: true })).toBe("关");
  });

  it("marks the global default in the description", () => {
    const enabledDefault = modeItems({ enabled: false, always: true });
    expect(enabledDefault[0]?.description).toContain("· default");
    expect(enabledDefault[1]?.description).not.toContain("· default");

    const disabledDefault = modeItems({ enabled: true, always: false });
    expect(disabledDefault[0]?.description).not.toContain("· default");
    expect(disabledDefault[1]?.description).toContain("· default");
  });

  it("offers exactly on and off", () => {
    const items = modeItems({ enabled: false, always: false });
    expect(items.map((item) => item.value)).toEqual(["on", "off"]);
    expect(items.map((item) => item.label.replace(/^[✓ ] /u, ""))).toEqual(["开", "关"]);
  });
});

describe("pickMode TUI component", () => {
  const open = async (snapshot: ModeSnapshot) => {
    let component:
      | { render(width: number): string[]; handleInput?(data: string): void }
      | undefined;
    let resolveChoice: ((choice: unknown) => void) | undefined;
    const ctx = {
      mode: "tui",
      ui: {
        custom: (
          factory: (
            tui: unknown,
            theme: unknown,
            keybindings: unknown,
            done: (choice: unknown) => void,
          ) => typeof component,
        ) => {
          const theme = {
            fg: (_token: string, text: string) => text,
            bold: (text: string) => text,
          };
          const keybindings = {
            matches: (data: string, id: string) => id === "app.thinking.save" && data === "\u0013",
          };
          return new Promise<unknown>((resolve) => {
            resolveChoice = resolve;
            component = factory({ requestRender: () => undefined }, theme, keybindings, resolve);
          });
        },
      },
    } as unknown as import("@earendil-works/pi-coding-agent").ExtensionContext;
    const picked = pickMode(ctx, snapshot);
    return { component, picked, resolveChoice: resolveChoice as unknown as (c: unknown) => void };
  };

  it("renders only 开 and 关 with the default marker", async () => {
    const { component } = await open({ enabled: false, always: true });
    const text = component?.render(80).join("\n") ?? "";
    expect(text).toContain("Orchestrator");
    expect(text).toContain("开");
    expect(text).toContain("关");
    expect(text).toContain("· default");
  });

  it("returns the current selection with persist=false on Enter", async () => {
    const { component, picked } = await open({ enabled: false, always: false });
    component?.handleInput?.("\r");
    await expect(picked).resolves.toEqual({ enabled: false, persist: false });
  });

  it("returns persist=true on the save key", async () => {
    const { component, picked } = await open({ enabled: true, always: false });
    component?.handleInput?.("\u0013");
    await expect(picked).resolves.toEqual({ enabled: true, persist: true });
  });
});
