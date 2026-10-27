import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { FSWatcher } from "chokidar";
import type {
  SkillCandidate,
  SkillProviderControl,
  SkillProviderObservation,
} from "@deepseek-ai/dsh-skill";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  findProjectRoot,
  isShippedOneLayerForm,
  isSkippedDirectory,
  NESTED_SKILL_RANKS,
  NestedSkillProvider,
  nestedRank,
  PROVIDER_NAME,
  walkSkillFiles,
} from "./provider.js";
import { flushTurns, memoryFs } from "./test-support.js";

const fakeCtx = { logger: { warn: vi.fn() }, get: () => undefined } as never;
const fakeControl = (invalidate = vi.fn()) =>
  ({
    signal: new AbortController().signal,
    invalidate,
  }) satisfies SkillProviderControl;

/** 平台中立的虚拟根：POSIX 下为 `/project`，Windows 下为 `<盘符>:\project`。 */
const ROOT = resolve("/project");
const USER_HOME = resolve("/home");
const EXT_ROOT = resolve("/ext");

/** `memoryFs` 与 provider 都以 `/` 形态呈现路径，用例用同一形态构造与断言。 */
const at = (root: string, ...segments: string[]): string => {
  return join(root, ...segments).replaceAll("\\", "/");
};

const TOP_SKILL = `---
name: nano-flow
description: 顶层 Skill
---

顶层。`;

const NESTED_SKILL = `---
name: to-story
description: 讲述用户故事
whenToUse: 角色未明确时
---

# 正文。`;

const FILES = {
  [at(ROOT, ".git")]: "",
  [at(ROOT, ".agents/skills/nano-flow/SKILL.md")]: TOP_SKILL,
  [at(ROOT, ".agents/skills/nano-flow/references/skills/to-story/SKILL.md")]: NESTED_SKILL,
  [at(ROOT, ".agents/skills/a/b/c/SKILL.md")]: `---
name: deep-c
description: 更深一层
---

deep`,
  [at(ROOT, ".agents/foo/SKILL.md")]: `---
name: foo-sk
description: .agents 直属目录
---

foo`,
  [at(ROOT, ".agents/skills/nano-flow/references/skills/invalid/SKILL.md")]: "# 无 frontmatter",
  [at(ROOT, ".agents/skills/nano-flow/references/skills/bad-name/SKILL.md")]: `---
name: To Story
description: 非法名
---

bad`,
  [at(ROOT, ".agents/skills/nano-flow/node_modules/pkg/SKILL.md")]: `---
name: ignored-pkg
description: 排除目录
---

pkg`,
  [at(ROOT, ".agents/skills/nano-flow/.hidden/h/SKILL.md")]: `---
name: hidden-h
description: 隐藏目录
---

hidden`,
};

/** 取候选清单；provider 可能以「不完整发现」形态返回。 */
const candidatesOf = async (
  provider: NestedSkillProvider,
  cwd: string = ROOT,
): Promise<readonly SkillCandidate[]> => {
  const result = await provider.list({ cwd });
  return Array.isArray(result) ? result : result.candidates;
};

const listNames = async (provider: NestedSkillProvider, cwd: string = ROOT): Promise<string[]> => {
  const candidates = await candidatesOf(provider, cwd);
  return candidates.map((candidate) => candidate.name).sort();
};

interface StubWatcher {
  on(event: string, handler: (...args: unknown[]) => void): StubWatcher;
  once(event: string, handler: (...args: unknown[]) => void): StubWatcher;
  off(event: string, handler: (...args: unknown[]) => void): StubWatcher;
  close(): Promise<void>;
  emit(event: string, ...args: unknown[]): void;
}

/** 只实现 provider 用到的 watcher 表面，用来让启动失败可注入。 */
const stubWatcher = (): StubWatcher => {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const remember = (event: string, handler: (...args: unknown[]) => void): void => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
  };
  const stub: StubWatcher = {
    on(event, handler) {
      remember(event, handler);
      return stub;
    },
    once(event, handler) {
      remember(event, handler);
      return stub;
    },
    off(event, handler) {
      handlers.set(
        event,
        (handlers.get(event) ?? []).filter((candidate) => candidate !== handler),
      );
      return stub;
    },
    close: async () => {},
    emit(event, ...args) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
  };
  return stub;
};

describe("NestedSkillProvider discovery", () => {
  it("finds nested skills at any depth and skips shipped one-layer forms", async () => {
    const provider = new NestedSkillProvider(
      fakeCtx,
      fakeControl(),
      { watch: false, includeUserRoots: false },
      memoryFs(FILES),
    );
    const names = await listNames(provider);
    expect(names).toContain("to-story");
    expect(names).toContain("deep-c");
    expect(names).toContain("foo-sk");
    expect(names).not.toContain("nano-flow");
    expect(names).not.toContain("invalid");
    expect(names).not.toContain("bad-name");
    expect(names).not.toContain("ignored-pkg");
    expect(names).not.toContain("hidden-h");
  });

  it("tags candidates with provider, rank, source, and resource base", async () => {
    const provider = new NestedSkillProvider(
      fakeCtx,
      fakeControl(),
      { watch: false, includeUserRoots: false },
      memoryFs(FILES),
    );
    const candidates = await candidatesOf(provider);
    const toStory = candidates.find((candidate) => candidate.name === "to-story");
    expect(toStory).toMatchObject({
      description: "讲述用户故事",
      whenToUse: "角色未明确时",
      provider: PROVIDER_NAME,
      source: "project-agents",
      rank: NESTED_SKILL_RANKS["project-agents"],
      invocation: { modelInvocable: true, userInvocable: true },
      resourceBase: {
        kind: "directory",
        path: at(ROOT, ".agents/skills/nano-flow/references/skills/to-story"),
      },
    });
    expect(toStory?.path).toBe(
      at(ROOT, ".agents/skills/nano-flow/references/skills/to-story/SKILL.md"),
    );
  });

  it("ranks each nested source one above its shipped one-layer form", () => {
    expect(nestedRank("project-agents")).toBe(201);
    expect(nestedRank("custom")).toBe(301);
    expect(nestedRank("user-agents")).toBe(501);
    expect(NESTED_SKILL_RANKS["project-agents"]).toBeLessThan(nestedRank("custom"));
  });

  it("sorts candidates deterministically by path", async () => {
    const provider = new NestedSkillProvider(
      fakeCtx,
      fakeControl(),
      { watch: false, includeUserRoots: false },
      memoryFs(FILES),
    );
    const candidates = await candidatesOf(provider);
    const paths = candidates.map((candidate) => candidate.path ?? "");
    expect(paths).toEqual([...paths].sort());
  });

  it("loads full definitions through get()", async () => {
    const provider = new NestedSkillProvider(
      fakeCtx,
      fakeControl(),
      { watch: false, includeUserRoots: false },
      memoryFs(FILES),
    );
    const candidates = await candidatesOf(provider);
    const toStory = candidates.find((candidate) => candidate.name === "to-story");
    const definition = await provider.get(toStory as SkillCandidate, {});
    expect(definition?.content).toBe("# 正文。");
    expect(definition?.source).toBe("project-agents");
    const missing = await provider.get(
      {
        ...(toStory as SkillCandidate),
        locator: { path: at(ROOT, "gone/SKILL.md"), directory: at(ROOT, "gone") },
      },
      {},
    );
    expect(missing).toBeUndefined();
  });

  it("honors user roots and includeUserRoots", async () => {
    const agentsHome = at(USER_HOME, ".agents");
    const userFiles = {
      ...FILES,
      [at(USER_HOME, ".agents/team/references/skills/zz/SKILL.md")]: `---
name: user-zz
description: 用户嵌套
---

zz`,
    };
    const withUser = new NestedSkillProvider(
      fakeCtx,
      fakeControl(),
      { watch: false, agentsHome },
      memoryFs(userFiles),
    );
    const userCandidates = await candidatesOf(withUser);
    expect(userCandidates.map((candidate) => candidate.name)).toContain("user-zz");
    expect(userCandidates.find((candidate) => candidate.name === "user-zz")?.rank).toBe(
      NESTED_SKILL_RANKS["user-agents"],
    );
    const withoutUser = new NestedSkillProvider(
      fakeCtx,
      fakeControl(),
      { watch: false, includeUserRoots: false },
      memoryFs(userFiles),
    );
    expect(await listNames(withoutUser)).not.toContain("user-zz");
  });

  it("honors extraRoots as custom source", async () => {
    const provider = new NestedSkillProvider(
      fakeCtx,
      fakeControl(),
      { watch: false, includeUserRoots: false, extraRoots: [EXT_ROOT] },
      memoryFs({
        [at(EXT_ROOT, "team/x/SKILL.md")]: NESTED_SKILL.replace("to-story", "ext-x").replace(
          "讲述用户故事",
          "外部",
        ),
      }),
    );
    const candidates = await candidatesOf(provider);
    const ext = candidates.find((candidate) => candidate.name === "ext-x");
    expect(ext?.source).toBe("custom");
    expect(ext?.rank).toBe(NESTED_SKILL_RANKS.custom);
  });

  it("reports incomplete discovery when a watcher fails to start", async () => {
    const provider = new NestedSkillProvider(
      fakeCtx,
      fakeControl(),
      { watch: true, includeUserRoots: false },
      memoryFs(FILES),
      (path) => {
        const watcher = stubWatcher();
        setTimeout(() => watcher.emit("error", new Error(`cannot watch ${path}`)), 0);
        return watcher as unknown as FSWatcher;
      },
    );
    const result = await provider.list({ cwd: ROOT });
    expect(Array.isArray(result)).toBe(false);
    const observation = result as SkillProviderObservation;
    expect(observation.complete).toBe(false);
    expect(observation.candidates.map((candidate) => candidate.name)).toContain("to-story");
    await provider.dispose();
  });

  it("invalidates on host mutations inside a scanned root only", async () => {
    const invalidate = vi.fn();
    const provider = new NestedSkillProvider(
      fakeCtx,
      fakeControl(invalidate),
      { watch: false, includeUserRoots: false },
      memoryFs(FILES),
    );
    await provider.list({ cwd: ROOT });
    provider.observeHostMutation(at(ROOT, ".agents/skills/nano-flow/references/skills/to-story"));
    provider.observeHostMutation(at(ROOT, ".agents/skills/nano-flow/references"));
    await flushTurns();
    expect(invalidate).toHaveBeenCalledTimes(1);
    provider.observeHostMutation(at(ROOT, "../elsewhere/file"));
    await flushTurns();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("disposes once when the registration signal aborts", async () => {
    const controller = new AbortController();
    const provider = new NestedSkillProvider(
      fakeCtx,
      { signal: controller.signal, invalidate: vi.fn() },
      { watch: false, includeUserRoots: false },
      memoryFs(FILES),
    );
    await provider.list({ cwd: ROOT });
    controller.abort();
    await provider.dispose();
    await provider.dispose();
  });
});

describe("walk helpers", () => {
  it("classifies the shipped one-layer form", () => {
    expect(isShippedOneLayerForm(["skills", "nano-flow", "SKILL.md"])).toBe(true);
    expect(isShippedOneLayerForm(["skills", "nano-flow", "references", "SKILL.md"])).toBe(false);
    expect(isShippedOneLayerForm(["foo", "SKILL.md"])).toBe(false);
  });

  it("classifies skipped directories", () => {
    const excluded = new Set(["node_modules"]);
    expect(isSkippedDirectory("node_modules", excluded)).toBe(true);
    expect(isSkippedDirectory(".hidden", excluded)).toBe(true);
    expect(isSkippedDirectory("references", excluded)).toBe(false);
  });

  it("walks only SKILL.md files below the root", async () => {
    const files = await walkSkillFiles(
      at(ROOT, ".agents"),
      memoryFs(FILES),
      new Set(["node_modules"]),
    );
    expect(files.map((file) => file.path).sort()).toEqual([
      at(ROOT, ".agents/foo/SKILL.md"),
      at(ROOT, ".agents/skills/a/b/c/SKILL.md"),
      at(ROOT, ".agents/skills/nano-flow/references/skills/bad-name/SKILL.md"),
      at(ROOT, ".agents/skills/nano-flow/references/skills/invalid/SKILL.md"),
      at(ROOT, ".agents/skills/nano-flow/references/skills/to-story/SKILL.md"),
    ]);
  });

  it("finds the project root via .git presence", async () => {
    const fs = memoryFs({ [at(ROOT, ".git")]: "" });
    expect(await findProjectRoot(ROOT, fs)).toBe(ROOT);
    expect(await findProjectRoot(join(ROOT, "sub"), fs)).toBe(ROOT);
  });
});

describe("NestedSkillProvider watcher (real filesystem)", () => {
  let cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.map((dir) => rm(dir, { recursive: true, force: true })));
    cleanup = [];
  });

  it("invalidates when a nested SKILL.md appears under a scanned root", async () => {
    const project = await mkdtemp(join(tmpdir(), "dsh-nested-skill-watch-"));
    cleanup.push(project);
    await mkdir(join(project, ".git"), { recursive: true });
    await mkdir(join(project, ".agents", "skills", "nano-flow", "references", "skills", "first"), {
      recursive: true,
    });
    await writeFile(
      join(project, ".agents", "skills", "nano-flow", "references", "skills", "first", "SKILL.md"),
      NESTED_SKILL,
      "utf8",
    );
    const invalidate = vi.fn();
    const provider = new NestedSkillProvider(fakeCtx, fakeControl(invalidate), {
      watch: true,
      includeUserRoots: false,
      watchUsePolling: true,
      watchStabilityThresholdMs: 40,
      watchPollIntervalMs: 20,
    });
    const before = await candidatesOf(provider, project);
    expect(before.map((candidate) => candidate.name)).toContain("to-story");
    await new Promise((resolveTurn) => setTimeout(resolveTurn, 500));
    await mkdir(join(project, ".agents", "skills", "nano-flow", "references", "skills", "second"), {
      recursive: true,
    });
    await writeFile(
      join(project, ".agents", "skills", "nano-flow", "references", "skills", "second", "SKILL.md"),
      `---
name: second-sk
description: 新出现的嵌套 skill
---

new`,
      "utf8",
    );
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalled(), { timeout: 15000 });
    await provider.dispose();
  });
});
