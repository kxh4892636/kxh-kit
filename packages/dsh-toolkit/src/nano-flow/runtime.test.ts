import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import {
  assetsCheckScript,
  assetsSkillsRoot,
  locateAssetsRoot,
  readLimitTemplate,
  readPromptText,
  readUserPromptText,
} from "./assets.js";
import { DEFAULT_DOMAIN_ROOT } from "./config.js";
import { disableMountReport } from "./mount-report.js";
import { applyNanoFlow, PROMPT_SECTION, USER_CONTEXT_NAME, USER_CONTEXT_ORDER } from "./plugin.js";
import { createAssetSkillProvider } from "./skills.js";
import { createCheckTool } from "./tools/check.js";
import { createCreateTool } from "./tools/create.js";
import { createToolRuntime } from "./tools/shared.js";
import type { HostServices, PromptContext, PromptContextEntry } from "./services.js";

disableMountReport();

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const makeDirectory = async (prefix: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
};

const fakeServices = (): HostServices => ({
  tools: { register: () => () => {} },
  systemPrompt: { section: () => () => {}, context: () => () => {} },
  logger: { warn: () => {} },
  get: () => undefined,
  on: () => () => {},
});

const exec = () => ({ signal: new AbortController().signal });

const createTools = (workspace: string) => {
  const assetsRoot = locateAssetsRoot();
  const runtime = createToolRuntime({
    services: fakeServices(),
    config: { workspace },
    settings: () => DEFAULT_NANO_FLOW_SETTINGS,
    assetsRoot,
    domainRoot: DEFAULT_DOMAIN_ROOT,
  });
  return {
    assetsRoot,
    create: createCreateTool(runtime),
    check: createCheckTool(runtime),
  };
};

describe("assets", () => {
  it("locates prompts, templates, skills and the check script", async () => {
    const assetsRoot = locateAssetsRoot();
    expect(readPromptText(assetsRoot)).toContain("# Nano Flow");
    expect(readUserPromptText(assetsRoot)).toContain("ask");
    expect(readLimitTemplate(assetsRoot)).toContain("## 篇幅限制");
    expect((await stat(join(assetsRoot, "prompts", "limit.md"))).isFile()).toBe(true);
    expect((await stat(join(assetsRoot, "templates", "spec.md"))).isFile()).toBe(true);
    expect((await stat(join(assetsRoot, "templates", "guide.md"))).isFile()).toBe(true);
    expect((await stat(assetsCheckScript(assetsRoot))).isFile()).toBe(true);
    const dream = await readFile(join(assetsRoot, "prompts", "dream.md"), "utf8");
    expect(dream).toContain("[nano-flow:dream]");
    expect(dream).toContain("subagent");
    const provider = createAssetSkillProvider(assetsSkillsRoot(assetsRoot));
    const listed = await provider.list({ signal: new AbortController().signal });
    const names = Array.isArray(listed) ? listed.map((candidate) => candidate.name) : [];
    expect(names).toEqual(
      expect.arrayContaining(["ask", "do", "to-skill", "code-spec", "learning"]),
    );
  });
});

describe("plugin entry", () => {
  it("registers the fixed prompt, runtime context, two tools and skill provider", () => {
    const toolNames: string[] = [];
    const sections: { name: string; order: number; text: unknown }[] = [];
    const contexts: PromptContextEntry[] = [];
    const providers: string[] = [];
    const disposers: Array<() => void> = [];
    const ctx = {
      tools: {
        register: (definition: { name: string }) => {
          toolNames.push(definition.name);
          return () => {};
        },
      },
      systemPrompt: {
        section: (section: { name: string; order: number; text: unknown }) => {
          sections.push(section);
          return () => {};
        },
        context: (entry: PromptContextEntry) => {
          contexts.push(entry);
          return () => {};
        },
      },
      skills: {
        registerProvider: (create: (control: object) => { name: string }) => {
          const provider = create({ signal: new AbortController().signal, invalidate: () => {} });
          providers.push(provider.name);
          return () => {};
        },
      },
      logger: { warn: () => {} },
      get: () => undefined,
      on: () => () => {},
      effect: (factory: () => () => void) => {
        disposers.push(factory());
      },
      inject: (_deps: string[], callback: (child: unknown) => void) => {
        callback(ctx);
      },
    } as unknown as Context;
    applyNanoFlow(ctx, { workspace: "/tmp" });
    expect(toolNames).toEqual(["nano_flow_create", "nano_flow_bind", "nano_flow_check"]);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ name: PROMPT_SECTION, order: 1 });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ name: USER_CONTEXT_NAME, order: USER_CONTEXT_ORDER });
    expect(providers).toEqual(["nano-flow-assets"]);
  });

  it("does not read ctx.agent while mounting", () => {
    const ctx = {
      tools: { register: () => () => {} },
      systemPrompt: { section: () => () => {}, context: () => () => {} },
      skills: { registerProvider: () => () => {} },
      logger: { warn: () => {} },
      get: (): unknown => undefined,
      on: () => () => {},
      effect: () => {},
      inject: (_deps: string[], callback: (child: unknown) => void) => {
        callback(ctx);
      },
    } as unknown as Context;
    Object.defineProperty(ctx, "agent", {
      get: () => {
        throw new Error('cannot get property "agent" without inject');
      },
    });
    expect(() => applyNanoFlow(ctx, { workspace: "/tmp" })).not.toThrow();
  });

  it("concatenates the GUIDE snapshot on first use and caches it", async () => {
    const workspace = await makeDirectory("nano-flow-guide-");
    await mkdir(join(workspace, ".agents", "domains"), { recursive: true });
    await writeFile(join(workspace, ".agents", "domains", "GUIDE.md"), "项目级补充。\n", "utf8");
    let section: { text: unknown } | undefined;
    const ctx = {
      tools: { register: () => () => {} },
      systemPrompt: {
        section: (input: { text: unknown }) => {
          section = input;
          return () => {};
        },
        context: () => () => {},
      },
      skills: { registerProvider: () => () => {} },
      logger: { warn: () => {} },
      get: () => undefined,
      on: () => () => {},
      effect: (factory: () => () => void) => {
        factory();
      },
      inject: (_deps: string[], callback: (child: unknown) => void) => {
        callback(ctx);
      },
    } as unknown as Context;
    applyNanoFlow(ctx, { workspace, domainRoot: DEFAULT_DOMAIN_ROOT });
    const captured = section;
    if (captured === undefined) throw new Error("nano-flow prompt section was not registered");
    const agent = { session: { header: { cwd: workspace } } };
    const text = (captured.text as (context: PromptContext) => string)({ agent });
    expect(text).toContain("# Nano Flow");
    expect(text).toContain("项目级补充。");
    await writeFile(join(workspace, ".agents", "domains", "GUIDE.md"), "后改内容。\n", "utf8");
    const cached = (captured.text as (context: PromptContext) => string)({ agent });
    expect(cached).toContain("项目级补充。");
    expect(cached).not.toContain("后改内容。");
  });
});

describe("settings", () => {
  it("keeps the defaults aligned with the contract", () => {
    expect(DEFAULT_NANO_FLOW_SETTINGS).toMatchObject({
      specMaxBytes: 34816,
      noteMaxBytes: 13312,
      noteDescriptionMaxChars: 233,
      contextMaxBytes: 91136,
      questionMaxBytes: 13312,
      adrMaxBytes: 8192,
      workflowMaxBytes: 34816,
      rotateAt: 0.618,
    });
  });
});

describe("tools", () => {
  it("creates a domain, plan and note, then check passes and generates indices", async () => {
    const workspace = await makeDirectory("nano-flow-tools-");
    const tools = createTools(workspace);

    const domain = String(
      await tools.create.execute(
        { kind: "domain", domain: "demo", name: "Demo 域", description: "演示域。" },
        exec(),
      ),
    );
    expect(domain).toContain("已创建/检查 domain: demo");
    // GUIDE.md 正文只由 dream 维护：建 domain 只落空模板，不写内容。
    const guide = join(workspace, ".agents", "domains", "GUIDE.md");
    expect((await stat(guide)).isFile()).toBe(true);
    expect(await readFile(guide, "utf8")).toBe("");
    expect((await stat(join(workspace, ".agents", "domains", "CONTEXT-MAP.md"))).isFile()).toBe(
      true,
    );
    expect(existsSync(join(workspace, "CONTEXT-MAP.md"))).toBe(false);

    const plan = String(
      await tools.create.execute(
        { kind: "plan", domain: "demo", name: "2026-11-08-支持取消" },
        exec(),
      ),
    );
    expect(plan).toContain("已创建 Plan");

    const note = String(
      await tools.create.execute(
        {
          kind: "note",
          domain: "demo",
          title: "取消订单",
          description: "客户可以取消未发货订单。",
        },
        exec(),
      ),
    );
    expect(note).toContain("001-取消订单.md");

    const check = String(await tools.check.execute({}, exec()));
    expect(check).toContain("领域文档校验通过");
    expect(check).toContain("已更新索引");

    const spec = await readFile(
      join(
        workspace,
        ".agents",
        "domains",
        "demo",
        "plans",
        "active",
        "2026-11-08-支持取消",
        "spec.md",
      ),
      "utf8",
    );
    expect(spec).toContain("## 追踪 Note");
    expect(spec).toContain("001-取消订单");
    const index = await readFile(
      join(
        workspace,
        ".agents",
        "domains",
        "demo",
        "plans",
        "active",
        "2026-11-08-支持取消",
        "notes_index.md",
      ),
      "utf8",
    );
    expect(index).toContain("001-取消订单");
    const map = await readFile(join(workspace, ".agents", "domains", "CONTEXT-MAP.md"), "utf8");
    expect(map).toContain("Demo 域");
  });

  it("reports header and status errors without crashing", async () => {
    const workspace = await makeDirectory("nano-flow-invalid-");
    const tools = createTools(workspace);
    await tools.create.execute({ kind: "domain", domain: "demo" }, exec());
    await tools.create.execute({ kind: "plan", domain: "demo", name: "2026-11-08-坏例子" }, exec());
    const noteFile = join(
      workspace,
      ".agents",
      "domains",
      "demo",
      "plans",
      "active",
      "2026-11-08-坏例子",
      "001-坏例子.md",
    );
    await writeFile(
      noteFile,
      [
        "---",
        "name: '001-坏例子'",
        "description: '坏例子。'",
        "status: blocked",
        "reason:",
        "related_noted: [999-不存在]",
        "next_step: '等'",
        "---",
        "",
        "# 001-坏例子",
        "",
      ].join("\n"),
      "utf8",
    );
    const result = String(await tools.check.execute({}, exec()));
    expect(result).toContain("校验失败");
    expect(result).toContain("缺少 reason");
    expect(result).toContain("related_noted 引用了不存在的 note");
  });
});
