import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import { disableMountReport } from "./mount-report.js";
import {
  applyNanoFlow,
  createSettingsReader,
  PROMPT_SECTION,
  USER_CONTEXT_NAME,
} from "./plugin.js";
import type { HostServices, PromptContext, PromptContextEntry } from "./services.js";

disableMountReport();

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "nano-flow-plugin-"));
  roots.push(root);
  return root;
};

interface Harness {
  readonly ctx: Context;
  readonly sections: { name: string; text: unknown }[];
  readonly contexts: PromptContextEntry[];
  readonly listeners: ((...args: unknown[]) => Promise<unknown>)[];
  readonly tests: string[];
}

const makeHarness = (options: { withContext?: boolean } = {}): Harness => {
  const sections: { name: string; text: unknown }[] = [];
  const contexts: PromptContextEntry[] = [];
  const listeners: ((...args: unknown[]) => Promise<unknown>)[] = [];
  const tests: string[] = [];
  const ctx = {
    tools: {
      register: (definition: { name: string }) => {
        tests.push(definition.name);
        return () => {};
      },
    },
    systemPrompt: {
      section: (section: { name: string; text: unknown }) => {
        sections.push(section);
        return () => {};
      },
      ...(options.withContext === false
        ? {}
        : {
            context: (entry: PromptContextEntry) => {
              contexts.push(entry);
              return () => {};
            },
          }),
    },
    skills: { registerProvider: () => () => {} },
    logger: { warn: () => {} },
    get: () => undefined,
    on: (event: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      if (event === "agent/pre-step") listeners.push(handler);
      return () => {};
    },
    effect: (factory: () => () => void) => {
      factory();
    },
    inject: (_deps: string[], callback: (child: unknown) => void) => {
      callback(ctx);
    },
  } as unknown as Context;
  return { ctx, sections, contexts, listeners, tests };
};

const sectionText = (harness: Harness): ((context: PromptContext) => string) => {
  const section = harness.sections[0];
  if (section === undefined) throw new Error("section not registered");
  return section.text as (context: PromptContext) => string;
};

const contextText = (harness: Harness): ((context: PromptContext) => string) => {
  const context = harness.contexts[0];
  if (context === undefined) throw new Error("context not registered");
  return context.text as (context: PromptContext) => string;
};

describe("createSettingsReader", () => {
  it("falls back to defaults when the facade is missing or throws", () => {
    expect(createSettingsReader({ get: () => undefined } as unknown as HostServices)()).toBe(
      DEFAULT_NANO_FLOW_SETTINGS,
    );
    const throwing = {
      get: () => ({
        settings: () => {
          throw new Error("boom");
        },
      }),
    } as unknown as HostServices;
    expect(createSettingsReader(throwing)()).toBe(DEFAULT_NANO_FLOW_SETTINGS);
  });

  it("reads the current settings from the toolkit service", () => {
    const facade = {
      get: () => ({ settings: () => ({ ...DEFAULT_NANO_FLOW_SETTINGS, noteMaxBytes: 1 }) }),
    } as unknown as HostServices;
    expect(createSettingsReader(facade)().noteMaxBytes).toBe(1);
  });
});

describe("applyNanoFlow", () => {
  it("mounts two tools, the prompt section, the runtime context and the skill provider", async () => {
    const workspace = await makeRoot();
    const harness = makeHarness();
    applyNanoFlow(harness.ctx, { workspace });
    expect(harness.tests).toEqual(["nano_flow_create", "nano_flow_check"]);
    expect(harness.sections.map((section) => section.name)).toEqual([PROMPT_SECTION]);
    expect(harness.contexts.map((context) => context.name)).toEqual([USER_CONTEXT_NAME]);
    expect(harness.listeners).toHaveLength(1);
  });

  it("requires nano_flow_check at the start of a Plan recovery", async () => {
    const workspace = await makeRoot();
    const harness = makeHarness();
    applyNanoFlow(harness.ctx, { workspace });
    const text = sectionText(harness)({ agent: { session: { header: { cwd: workspace } } } });
    expect(text).toContain("开头先跑一次 `nano_flow_check`");
    expect(text).toContain("seed 已带校验结论时跳过");
  });

  it("documents the related-links contract and the dream entry", async () => {
    const workspace = await makeRoot();
    const harness = makeHarness();
    applyNanoFlow(harness.ctx, { workspace });
    const text = sectionText(harness)({ agent: { session: { header: { cwd: workspace } } } });
    expect(text).toContain("## 互链");
    expect(text).toContain("[nano-flow:dream]");
  });

  it("does not append note snapshots to the session log", async () => {
    const workspace = await makeRoot();
    const harness = makeHarness();
    applyNanoFlow(harness.ctx, { workspace });
    const append = vi.fn();
    const agent = { session: { header: { cwd: workspace }, append } };
    const listener = harness.listeners[0];
    if (listener === undefined) throw new Error("pre-step listener not registered");
    await listener({ agent, turn: 1, step: 1 }, async () => undefined);
    expect(append).not.toHaveBeenCalled();
  });

  it("works on a host without systemPrompt.context", async () => {
    const workspace = await makeRoot();
    const harness = makeHarness({ withContext: false });
    expect(() => applyNanoFlow(harness.ctx, { workspace })).not.toThrow();
    expect(harness.contexts).toEqual([]);
    expect(harness.sections).toHaveLength(1);
  });

  it("concatenates the GUIDE snapshot once per agent", async () => {
    const workspace = await makeRoot();
    await mkdir(join(workspace, ".agents", "domains"), { recursive: true });
    await writeFile(join(workspace, ".agents", "domains", "GUIDE.md"), "项目补充。\n", "utf8");
    const harness = makeHarness();
    applyNanoFlow(harness.ctx, { workspace });
    const agent = { session: { header: { cwd: workspace } } };
    const text = sectionText(harness)({ agent });
    expect(text).toContain("项目补充。");
    expect(text).toContain("## 篇幅限制");
    expect(text).toContain("description ≤ 233 字");
    expect(text.indexOf("# Nano Flow")).toBeLessThan(text.indexOf("项目补充。"));
    expect(text.indexOf("项目补充。")).toBeLessThan(text.indexOf("## 篇幅限制"));
  });

  it("omits an empty or missing GUIDE", async () => {
    const workspace = await makeRoot();
    const harness = makeHarness();
    applyNanoFlow(harness.ctx, { workspace });
    const text = sectionText(harness)({ agent: { session: { header: { cwd: workspace } } } });
    expect(text).not.toContain("项目补充");
    expect(sectionText(harness)({})).toContain("# Nano Flow");
    expect(sectionText(harness)({ agent: "not-an-object" })).toContain("# Nano Flow");
  });

  it("falls back to config.workspace when the agent has no session header", async () => {
    const workspace = await makeRoot();
    await mkdir(join(workspace, ".agents", "domains"), { recursive: true });
    await writeFile(join(workspace, ".agents", "domains", "GUIDE.md"), "工作区补充。\n", "utf8");
    const harness = makeHarness();
    applyNanoFlow(harness.ctx, { workspace });
    expect(sectionText(harness)({})).toContain("工作区补充。");
  });

  it("adds the user prompt on the first step of every turn", async () => {
    const workspace = await makeRoot();
    const harness = makeHarness();
    applyNanoFlow(harness.ctx, { workspace });
    const textOf = contextText(harness);
    const agent = { session: { header: { cwd: workspace } } };
    expect(textOf({ agent })).not.toContain("nano-flow turn");
    const listener = harness.listeners[0];
    if (listener === undefined) throw new Error("pre-step listener not registered");

    await listener({ agent, turn: 2, step: 2 }, async () => undefined);
    expect(textOf({ agent })).not.toContain("nano-flow turn 2");
    await listener({ agent, turn: 2, step: 1 }, async () => undefined);
    expect(textOf({ agent })).toContain("nano-flow turn 2");
    await listener({ agent, turn: 3, step: 1 }, async () => undefined);
    expect(textOf({ agent })).toContain("nano-flow turn 3");
    expect(textOf({})).not.toContain("nano-flow turn");
  });

  it("ignores malformed pre-step payloads", async () => {
    const workspace = await makeRoot();
    const harness = makeHarness();
    applyNanoFlow(harness.ctx, { workspace });
    const listener = harness.listeners[0];
    if (listener === undefined) throw new Error("pre-step listener not registered");
    await expect(listener({}).catch(() => undefined)).resolves.toBeUndefined();
    await expect(listener(undefined, undefined)).resolves.toBeUndefined();
  });
});
