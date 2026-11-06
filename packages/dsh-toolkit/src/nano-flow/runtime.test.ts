import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SkillCandidate } from "@deepseek-ai/dsh-skill";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { assetsCheckScript, assetsSkillsRoot, locateAssetsRoot, readPromptText } from "./assets.js";
import { runCheck } from "./check-runner.js";
import { byteLength } from "./dag.js";
import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import { parseNanoFlowSettings } from "../host/nano-flow-settings.js";
import { createAssetSkillProvider } from "./skills.js";
import type { HostServices } from "./services.js";
import { createCheckTool } from "./tools/check.js";
import { createReadTool } from "./tools/read.js";
import { createToolRuntime } from "./tools/shared.js";
import { createWriteTool } from "./tools/write.js";
import { applyNanoFlow, PROMPT_SECTION } from "./plugin.js";
import type { Context } from "@deepseek-ai/cordis";

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
  systemPrompt: { section: () => () => {} },
  logger: { warn: () => {} },
  get: () => undefined,
  on: () => () => {},
});

const createTools = (workspace: string) => {
  const assetsRoot = locateAssetsRoot();
  const limits = DEFAULT_NANO_FLOW_SETTINGS;
  const runtime = createToolRuntime({
    services: fakeServices(),
    config: { workspace },
    settings: () => limits,
    assetsRoot,
    domainRoot: ".agents/domains",
  });
  return {
    assetsRoot,
    limits,
    read: createReadTool(runtime),
    write: createWriteTool(runtime),
    check: createCheckTool(runtime),
  };
};

const exec = () => ({ signal: new AbortController().signal });

const makeWorkspace = async (): Promise<string> => {
  const root = await makeDirectory("nano-flow-");
  await mkdir(join(root, ".agents/domains/demo"), { recursive: true });
  await writeFile(
    join(root, "CONTEXT-MAP.md"),
    "# Context Map\n\n## Contexts\n\n- [demo](./.agents/domains/demo/CONTEXT.md) - 示例域。\n\n## Relationships\n",
    "utf8",
  );
  await writeFile(
    join(root, ".agents/domains/demo/CONTEXT.md"),
    "# demo\n\n示例域职责。\n",
    "utf8",
  );
  await writeFile(
    join(root, ".agents/domains/demo/QUESTIONS.md"),
    "# demo 常见问题\n\n暂无已验证的重复问题。\n",
    "utf8",
  );
  return root;
};

describe("plugin entry", () => {
  it("注册固定提示词、三个工具与动态 skill provider", () => {
    const toolNames: string[] = [];
    const sectionNames: string[] = [];
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
        section: (section: { name: string }) => {
          sectionNames.push(section.name);
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
    expect(toolNames).toEqual(["nano_flow_read", "nano_flow_write", "nano_flow_check"]);
    expect(sectionNames).toEqual([PROMPT_SECTION]);
    expect(providers).toEqual(["nano-flow-assets"]);
  });
});

describe("settings", () => {
  it("默认值与契约一致", () => {
    expect(DEFAULT_NANO_FLOW_SETTINGS).toMatchObject({
      storyMaxBytes: 34816,
      noteMaxBytes: 13312,
      contextMaxBytes: 91136,
      adrMaxBytes: 13312,
      adrMaxCount: 55,
      indexMaxRows: 13,
      rotateAt: 0.618,
    });
  });

  it("只接受正整数与 (0,1] 的阈值", () => {
    expect(() => parseNanoFlowSettings({ storyMaxBytes: "x" })).toThrow(/storyMaxBytes/);
    expect(() => parseNanoFlowSettings({ storyMaxBytes: 0 })).toThrow(/storyMaxBytes/);
    expect(() => parseNanoFlowSettings({ adrMaxCount: 0 })).toThrow(/adrMaxCount/);
    expect(() => parseNanoFlowSettings({ rotateAt: 0 })).toThrow(/rotateAt/);
    expect(() => parseNanoFlowSettings({ rotateAt: 1.2 })).toThrow(/rotateAt/);
    expect(parseNanoFlowSettings({ noteMaxBytes: 2048 }).noteMaxBytes).toBe(2048);
  });

  it("提示词不含插值占位", () => {
    const prompt = readPromptText(locateAssetsRoot());
    expect(prompt).not.toContain("{{");
    expect(byteLength(prompt)).toBeGreaterThan(0);
  });
});

describe("assets", () => {
  it("四个原样 skill 与锁文件逐字节一致", async () => {
    const assetsRoot = locateAssetsRoot();
    const lock = JSON.parse(await readFile(join(assetsRoot, "assets.lock.json"), "utf8")) as {
      skills: Record<string, Record<string, string>>;
    };
    for (const [skill, files] of Object.entries(lock.skills)) {
      for (const [file, hash] of Object.entries(files)) {
        const content = await readFile(join(assetsSkillsRoot(assetsRoot), skill, file));
        const actual = createHash("sha256").update(content).digest("hex");
        expect(actual, `${skill}/${file}`).toBe(hash);
      }
    }
  });

  it("动态发现全部 skill，ask / do 可被模型调用", async () => {
    const provider = createAssetSkillProvider(assetsSkillsRoot(locateAssetsRoot()));
    const candidates = (await provider.list({})) as readonly SkillCandidate[];
    expect(candidates.map((candidate) => candidate.name).sort()).toEqual([
      "ask",
      "code-spec",
      "do",
      "kaizen",
      "learning",
      "to-skill",
    ]);
    const ask = candidates.find((candidate) => candidate.name === "ask");
    expect(ask?.invocation).toEqual({ modelInvocable: true, userInvocable: true });
    const doSkill = candidates.find((candidate) => candidate.name === "do");
    expect(doSkill?.invocation).toEqual({ modelInvocable: true, userInvocable: true });
    const definition = ask === undefined ? undefined : await provider.get(ask, {});
    expect(definition?.content).toContain("ask 循环");
  });
});

describe("tools", () => {
  it("从建 Plan 到完成一条 note 的闭环", async () => {
    const workspace = await makeWorkspace();
    const tools = createTools(workspace);

    const initialized = await tools.write.execute(
      { op: "init", domain: "demo", name: "2026-11-06-示例工作" },
      exec(),
    );
    expect(String(initialized)).toContain("demo/active/2026-11-06-示例工作");

    const created = await tools.write.execute(
      {
        op: "create",
        title: "示例 note",
        description: "一句话摘要",
        content: "正文内容",
      },
      exec(),
    );
    expect(String(created)).toContain("已创建 note 01");

    const listed = await tools.read.execute({ op: "notes" }, exec());
    expect(String(listed)).toContain("[pending] 示例 note");

    await tools.write.execute({ op: "status", note: "01", status: "in_progress" }, exec());
    await tools.write.execute({ op: "set_index", ids: ["01"] }, exec());
    const completed = await tools.write.execute(
      { op: "complete", note: "01", evidence: ["pnpm test 通过"] },
      exec(),
    );
    expect(String(completed)).toContain("已完成 note 01");

    const resumed = await tools.read.execute({ op: "resume" }, exec());
    const resumeText = String(resumed);
    expect(resumeText).toContain("completed 1");
    expect(resumeText).toContain("关键索引（1）");

    const workspaceCheck = await tools.check.execute({ op: "workspace" }, exec());
    expect(String(workspaceCheck)).toContain("工作区校验通过");
  });

  it("move 在 active / reference / archived 之间迁移", async () => {
    const workspace = await makeWorkspace();
    const tools = createTools(workspace);
    await tools.write.execute({ op: "init", domain: "demo", name: "2026-11-07-生命周期" }, exec());
    await tools.write.execute(
      { op: "create", title: "示例 note", description: "摘要", content: "正文" },
      exec(),
    );
    await tools.write.execute({ op: "complete", note: "01", evidence: ["校验通过"] }, exec());

    // 旧生命周期名不再是合法目标
    await expect(
      tools.write.execute({ op: "move", lifecycle: "implementing" }, exec()),
    ).rejects.toThrow(/active \| reference \| archived/);

    const moved = await tools.write.execute({ op: "move", lifecycle: "reference" }, exec());
    expect(String(moved)).toContain("demo/reference/2026-11-07-生命周期");
    const referenceNotes = await tools.read.execute(
      { op: "notes", plan: "demo/reference/2026-11-07-生命周期" },
      exec(),
    );
    expect(String(referenceNotes)).toContain("[completed] 示例 note");

    await tools.write.execute(
      { op: "move", plan: "demo/reference/2026-11-07-生命周期", lifecycle: "archived" },
      exec(),
    );
    const archivedNotes = await tools.read.execute(
      { op: "notes", plan: "demo/archived/2026-11-07-生命周期" },
      exec(),
    );
    expect(String(archivedNotes)).toContain("[completed] 示例 note");

    // active 下已经没有 Plan：省略 plan 时不再解析到它
    await expect(tools.write.execute({ op: "move", lifecycle: "active" }, exec())).rejects.toThrow(
      /没有 active 的 Plan/,
    );
  });

  it("init 会补齐领域文档与索引", async () => {
    const workspace = await makeDirectory("nano-flow-empty-");
    const tools = createTools(workspace);
    await tools.write.execute({ op: "init", domain: "demo", name: "2026-11-06-新建工作" }, exec());
    const result = await tools.check.execute({ op: "workspace" }, exec());
    expect(String(result)).toContain("工作区校验通过");
  });

  it("complete 在 Plan 校验失败时拒绝", async () => {
    const workspace = await makeWorkspace();
    const tools = createTools(workspace);
    await tools.write.execute({ op: "init", domain: "demo", name: "2026-11-06-示例工作" }, exec());
    await tools.write.execute(
      { op: "create", title: "示例 note", description: "摘要", content: "正文" },
      exec(),
    );
    // story 用文件工具写到超过上限：脚本能发现，工具自己发现不了，正好验证门禁
    const planDirectory = join(workspace, ".agents/domains/demo/plans/active/2026-11-06-示例工作");
    await writeFile(join(planDirectory, "story.md"), `# 超长故事\n${"中".repeat(12000)}`, "utf8");
    await expect(
      tools.write.execute({ op: "complete", note: "01", evidence: ["完成"] }, exec()),
    ).rejects.toThrow(/校验未通过/);
  });

  it("check 脚本对环与超限报错", async () => {
    const workspace = await makeWorkspace();
    const planDirectory = join(workspace, ".agents/domains/demo/plans/active/2026-11-06-坏例子");
    await mkdir(planDirectory, { recursive: true });
    await writeFile(join(planDirectory, "story.md"), "# 坏例子\n", "utf8");
    await writeFile(join(planDirectory, "spec.md"), "# 坏例子\n", "utf8");
    await writeFile(
      join(planDirectory, "notes.json"),
      JSON.stringify(
        {
          version: 1,
          index: [],
          notes: [
            {
              id: "01",
              title: "环一",
              description: "摘要",
              status: "pending",
              blocked_by: ["02"],
              evidence: [],
              updated_at: "",
              content: "正文",
            },
            {
              id: "02",
              title: "环二",
              description: "摘要",
              status: "pending",
              blocked_by: ["01"],
              evidence: [],
              updated_at: "",
              content: "正文",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    const result = await runCheck({
      script: assetsCheckScript(locateAssetsRoot()),
      workspace,
      domainsPath: ".agents/domains",
      limits: DEFAULT_NANO_FLOW_SETTINGS,
      planRef: "demo/active/2026-11-06-坏例子",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.message.includes("环"))).toBe(true);
  });

  it("check 脚本按 ADR 数量上限报错", async () => {
    const workspace = await makeWorkspace();
    const adrDirectory = join(workspace, ".agents/domains/demo/adr");
    await mkdir(adrDirectory, { recursive: true });
    for (let index = 1; index <= 56; index += 1) {
      const name = `${String(index).padStart(4, "0")}-决策${index}.md`;
      await writeFile(join(adrDirectory, name), `# 决策\n\n理由 ${index}。\n`, "utf8");
    }
    const result = await runCheck({
      script: assetsCheckScript(locateAssetsRoot()),
      workspace,
      domainsPath: ".agents/domains",
      limits: DEFAULT_NANO_FLOW_SETTINGS,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.message.includes("超过 55"))).toBe(true);
  });
});
