import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createNestedSkillTool } from "./nested-skill.js";
import { createUndoTurnTool } from "./undo-turn.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("nested-skill tool", () => {
  const toolContext = () => {
    const providerNames: string[] = [];
    const observers: ((...args: unknown[]) => void)[] = [];
    const ctx = {
      logger: { warn: vi.fn() },
      get: () => undefined,
      skills: {
        registerProvider: (create: (control: object) => { name: string }) => {
          const provider = create({ signal: new AbortController().signal, invalidate: () => {} });
          providerNames.push(provider.name);
          return () => {
            providerNames.splice(providerNames.indexOf(provider.name), 1);
          };
        },
      },
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === "fs/observed") observers.push(handler);
        return () => {
          const index = observers.indexOf(handler);
          if (index >= 0) observers.splice(index, 1);
        };
      },
    };
    return { ctx, providerNames, observers };
  };

  it("declares the catalog entry and registers a provider on apply", () => {
    const tool = createNestedSkillTool({ watch: false });
    expect(tool).toMatchObject({ id: "nested-skill", defaultEnabled: true });
    const { ctx, providerNames, observers } = toolContext();
    const dispose = tool.apply(ctx as never);
    expect(providerNames).toEqual(["nested-agents"]);
    expect(observers).toHaveLength(1);
    dispose();
    expect(providerNames).toEqual([]);
    expect(observers).toHaveLength(0);
  });

  it("only reacts to edit/write observations", () => {
    const tool = createNestedSkillTool({ watch: false });
    const { ctx, observers } = toolContext();
    const dispose = tool.apply(ctx as never);
    const handler = observers[0];
    expect(() =>
      handler?.({ displayPath: "C:/x/.agents/a" }, undefined, { name: "read" }),
    ).not.toThrow();
    expect(() =>
      handler?.({ displayPath: "C:/x/.agents/a" }, undefined, { name: "edit" }),
    ).not.toThrow();
    expect(() => handler?.({ displayPath: "C:/x/.agents/a" }, undefined, undefined)).not.toThrow();
    dispose();
  });
});

describe("undo-turn tool", () => {
  it("declares the catalog entry without host state", () => {
    const tool = createUndoTurnTool();
    expect(tool).toMatchObject({ id: "undo-turn", defaultEnabled: true });
    const dispose = tool.apply({} as never);
    expect(dispose).toBeTypeOf("function");
    dispose();
  });
});
