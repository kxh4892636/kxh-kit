import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createNestedSkillTool } from "./nested-skill.js";
import { createOfficeSkillsTool } from "./office-skills.js";
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
    // 所有工具默认关闭（用户要求）：需要用户在 toolkit 面板里显式打开。
    expect(tool).toMatchObject({ id: "nested-skill", defaultEnabled: false });
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
    expect(tool).toMatchObject({ id: "undo-turn", defaultEnabled: false });
    const dispose = tool.apply({} as never);
    expect(dispose).toBeTypeOf("function");
    dispose();
  });
});

describe("office-skills tool", () => {
  const skillContext = () => {
    const skills = [
      {
        name: "office-docx",
        description: "word documents",
        invocation: { modelInvocable: true, userInvocable: true },
        source: "bundled",
        provider: "dsh-office",
      },
      {
        name: "code-spec",
        description: "coding rules",
        invocation: { modelInvocable: true, userInvocable: true },
        source: "project-agents",
        provider: "nested-agents",
      },
    ];
    const service = {
      list: async () => [...skills],
      snapshot: async () => ({ skills: [...skills], complete: true }),
      get: async (name: string) => {
        const match = skills.find((skill) => skill.name === name);
        return match === undefined ? undefined : { ...match, content: `${name} body` };
      },
    };
    const ctx = {
      get: (key: string) => (key === "skills" ? service : undefined),
      logger: { warn: vi.fn() },
    };
    return { ctx, service };
  };

  it("masks office skills only while the tool is applied", async () => {
    const tool = createOfficeSkillsTool();
    expect(tool).toMatchObject({ id: "office-skills", defaultEnabled: false });
    const { ctx, service } = skillContext();
    const dispose = tool.apply(ctx as never);
    expect((await service.snapshot()).skills.map((skill) => skill.name)).toEqual(["code-spec"]);
    expect(await service.get("office-docx")).toBeUndefined();
    expect((await service.get("code-spec"))?.content).toBe("code-spec body");
    dispose();
    expect((await service.snapshot()).skills).toHaveLength(2);
    expect(await service.get("office-docx")).toBeDefined();
  });
});
