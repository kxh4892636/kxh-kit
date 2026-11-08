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
import { disableMountReport } from "./mount-report.js";
import type { Context } from "@deepseek-ai/cordis";

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

  it("不读 ctx.agent 这类需要 inject 的服务属性", () => {
    // cordis 对服务属性做 inject 守卫：预设行不能声明 `agent` 依赖，直接读会抛
    // `cannot get property "agent" without inject`，整条预设行随之静默失败。
    const ctx = {
      tools: { register: () => () => {} },
      systemPrompt: { section: () => () => {} },
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
    expect(definition?.content).toContain("Design tree");
    expect(definition?.content).toContain("frontier");
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
    await tools.write.execute(
      { op: "status", note: "01", status: "waiting", needs: "review" },
      exec(),
    );
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

  it("ready 把有依赖关系的 notes 分到同一组", async () => {
    const workspace = await makeWorkspace();
    const tools = createTools(workspace);
    await tools.write.execute({ op: "init", domain: "demo", name: "2026-11-07-ready分组" }, exec());
    await tools.write.execute(
      { op: "create", title: "基座", description: "基座摘要", content: "正文" },
      exec(),
    );
    await tools.write.execute(
      {
        op: "create",
        title: "后续",
        description: "后续摘要",
        content: "正文",
        blocked_by: ["01"],
      },
      exec(),
    );
    await tools.write.execute(
      { op: "create", title: "并行", description: "并行摘要", content: "正文" },
      exec(),
    );
    await tools.write.execute({ op: "status", note: "03", status: "in_progress" }, exec());

    const text = String(await tools.read.execute({ op: "ready" }, exec()));
    expect(text).toContain("未完成（3）");
    expect(text).toContain("第 1 组（2）");
    expect(text).toContain("第 2 组（1）");
    expect(text.indexOf("01 [pending]")).toBeLessThan(text.indexOf("02 [pending]"));
    expect(text).toContain("（依赖: 01）");
    expect(text).toContain("03 [in_progress]");
  });

  it("pending 可直接进 waiting；complete 只接受 waiting + needs=review 的 note", async () => {
    const workspace = await makeWorkspace();
    const tools = createTools(workspace);
    await tools.write.execute({ op: "init", domain: "demo", name: "2026-11-07-完成门槛" }, exec());
    await tools.write.execute(
      { op: "create", title: "示例 note", description: "摘要", content: "正文" },
      exec(),
    );
    // pending 不必先假装开工：直接挂着等回答
    await tools.write.execute(
      { op: "status", note: "01", status: "waiting", needs: "answer" },
      exec(),
    );
    await expect(
      tools.write.execute({ op: "complete", note: "01", evidence: ["做完了"] }, exec()),
    ).rejects.toThrow(/review/);
    await tools.write.execute({ op: "status", note: "01", status: "in_progress" }, exec());
    await expect(
      tools.write.execute({ op: "complete", note: "01", evidence: ["做完了"] }, exec()),
    ).rejects.toThrow(/waiting/);
    // waiting/answer 也不能完成
    await tools.write.execute(
      { op: "status", note: "01", status: "waiting", needs: "answer" },
      exec(),
    );
    await expect(
      tools.write.execute({ op: "complete", note: "01", evidence: ["做完了"] }, exec()),
    ).rejects.toThrow(/review/);
    // 拒绝时不能落盘成 completed
    const listed = String(await tools.read.execute({ op: "notes" }, exec()));
    expect(listed).toContain("[waiting/answer] 示例 note");

    await tools.write.execute(
      { op: "status", note: "01", status: "waiting", needs: "review" },
      exec(),
    );
    const completed = await tools.write.execute(
      { op: "complete", note: "01", evidence: ["真机验证通过"] },
      exec(),
    );
    expect(String(completed)).toContain("已完成 note 01");
  });

  it("blocked 并入 waiting：status=blocked 被拒，needs=blocked 必须给 reason", async () => {
    const workspace = await makeWorkspace();
    const tools = createTools(workspace);
    await tools.write.execute(
      { op: "init", domain: "demo", name: "2026-11-08-阻塞并入等待" },
      exec(),
    );
    await tools.write.execute(
      { op: "create", title: "等外部", description: "摘要", content: "正文" },
      exec(),
    );
    await expect(
      tools.write.execute({ op: "status", note: "01", status: "blocked" }, exec()),
    ).rejects.toThrow(/needs=blocked/);
    await expect(
      tools.write.execute(
        { op: "status", note: "01", status: "waiting", needs: "blocked" },
        exec(),
      ),
    ).rejects.toThrow(/reason/);
    const moved = await tools.write.execute(
      { op: "status", note: "01", status: "waiting", needs: "blocked", reason: "等上游接口" },
      exec(),
    );
    expect(String(moved)).toContain("waiting/blocked");
    const resumed = String(await tools.read.execute({ op: "resume" }, exec()));
    expect(resumed).toContain("待阻塞解除（1）");
    expect(resumed).toContain("01 [waiting/blocked] 等外部 — 摘要（等上游接口）");
    // 阻塞解除后回 in_progress，原因随之清掉
    await tools.write.execute({ op: "status", note: "01", status: "in_progress" }, exec());
    const reopened = String(await tools.read.execute({ op: "notes" }, exec()));
    expect(reopened).toContain("01 [in_progress] 等外部");
    expect(reopened).not.toContain("等上游接口");
  });

  it("resume 单列等待回答/等待确认，readyNotes 不列它", async () => {
    const workspace = await makeWorkspace();
    const tools = createTools(workspace);
    await tools.write.execute({ op: "init", domain: "demo", name: "2026-11-07-等待确认" }, exec());
    await tools.write.execute(
      { op: "create", title: "等真机", description: "代码好了", content: "正文" },
      exec(),
    );
    await tools.write.execute(
      { op: "create", title: "等拍板", description: "要选方案", content: "正文" },
      exec(),
    );
    await tools.write.execute({ op: "status", note: "01", status: "in_progress" }, exec());
    await tools.write.execute(
      { op: "status", note: "01", status: "waiting", needs: "review" },
      exec(),
    );
    await tools.write.execute({ op: "status", note: "02", status: "in_progress" }, exec());
    await tools.write.execute(
      { op: "status", note: "02", status: "waiting", needs: "answer" },
      exec(),
    );

    const resumed = String(await tools.read.execute({ op: "resume" }, exec()));
    expect(resumed).toContain("可推进（0）");
    expect(resumed).toContain("等待确认（1）");
    expect(resumed).toContain("等待回答（1）");
    expect(resumed).toContain("01 [waiting/review] 等真机 — 代码好了");
    expect(resumed).toContain("02 [waiting/answer] 等拍板 — 要选方案");

    const readied = String(await tools.read.execute({ op: "ready" }, exec()));
    expect(readied).toContain("未完成（2）");
    expect(readied).toContain("01 [waiting/review] 等真机");
  });

  it("inspect + repair 修复无法通过校验的文档", async () => {
    const workspace = await makeWorkspace();
    const tools = createTools(workspace);
    await tools.write.execute({ op: "init", domain: "demo", name: "2026-11-08-修复" }, exec());
    await tools.write.execute(
      { op: "create", title: "坏摘要", description: "摘要", content: "正文" },
      exec(),
    );
    const planDirectory = join(workspace, ".agents/domains/demo/plans/active/2026-11-08-修复");
    const raw = JSON.parse(await readFile(join(planDirectory, "notes.json"), "utf8")) as {
      notes: { description: string }[];
      index: string[];
    };
    raw.notes[0]!.description = "长".repeat(200);
    raw.index = ["01"];
    await writeFile(join(planDirectory, "notes.json"), JSON.stringify(raw), "utf8");

    await expect(tools.read.execute({ op: "resume" }, exec())).rejects.toThrow(/description/);
    const inspected = String(await tools.read.execute({ op: "inspect" }, exec()));
    expect(inspected).toContain("原始视图");
    expect(inspected).toContain("坏摘要");
    expect(inspected).toContain("index: 01");

    const repaired = String(
      await tools.write.execute(
        { op: "repair", repairs: [{ note: "01", description: "压回一句话" }], ids: ["01"] },
        exec(),
      ),
    );
    expect(repaired).toContain("已修复：01");
    expect(repaired).toContain("索引 1 项");

    const resumed = String(await tools.read.execute({ op: "resume" }, exec()));
    expect(resumed).toContain("关键索引（1）");
    expect(resumed).toContain("压回一句话");
  });

  it("move 在 active / reference / archived 之间迁移", async () => {
    const workspace = await makeWorkspace();
    const tools = createTools(workspace);
    await tools.write.execute({ op: "init", domain: "demo", name: "2026-11-07-生命周期" }, exec());
    await tools.write.execute(
      { op: "create", title: "示例 note", description: "摘要", content: "正文" },
      exec(),
    );
    await tools.write.execute({ op: "status", note: "01", status: "in_progress" }, exec());
    await tools.write.execute(
      { op: "status", note: "01", status: "waiting", needs: "review" },
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
    await tools.write.execute({ op: "status", note: "01", status: "in_progress" }, exec());
    await tools.write.execute(
      { op: "status", note: "01", status: "waiting", needs: "review" },
      exec(),
    );
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

  it("check 脚本只校验 active Plan 的 Markdown 链接", async () => {
    const workspace = await makeWorkspace();
    const makePlan = async (lifecycle: string, name: string): Promise<void> => {
      const directory = join(workspace, `.agents/domains/demo/plans/${lifecycle}/${name}`);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "story.md"), "# 示例\n\n[缺失](./missing.md)\n", "utf8");
      await writeFile(join(directory, "spec.md"), "# 示例\n", "utf8");
      await writeFile(
        join(directory, "notes.json"),
        JSON.stringify({ version: 1, index: [], notes: [] }),
        "utf8",
      );
    };
    await makePlan("active", "2026-11-07-活跃");
    await makePlan("reference", "2026-11-07-冻结");
    const check = (planRef: string) =>
      runCheck({
        script: assetsCheckScript(locateAssetsRoot()),
        workspace,
        domainsPath: ".agents/domains",
        limits: DEFAULT_NANO_FLOW_SETTINGS,
        planRef,
      });

    const active = await check("demo/active/2026-11-07-活跃");
    expect(active.ok).toBe(false);
    expect(active.errors.some((error) => error.rule === "link")).toBe(true);

    const reference = await check("demo/reference/2026-11-07-冻结");
    expect(reference.ok).toBe(true);
    expect(reference.errors).toEqual([]);
  });
});
