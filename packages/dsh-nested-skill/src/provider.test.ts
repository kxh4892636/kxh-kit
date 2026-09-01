import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SkillCandidateLike, SkillProviderControlLike } from "./contract.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findProjectRoot,
  isShippedOneLayerForm,
  isSkippedDirectory,
  NESTED_SKILL_RANK,
  NestedSkillProvider,
  PROVIDER_NAME,
  walkSkillFiles,
} from "./provider.js";
import { flushTurns, memoryFs } from "./test-support.js";

const fakeCtx = { logger: { warn: vi.fn() }, get: () => undefined } as never;
const fakeControl = (invalidate = vi.fn()) =>
  ({
    signal: new AbortController().signal,
    invalidate,
  }) satisfies SkillProviderControlLike;

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
  "C:/project/.git": "",
  "C:/project/.agents/skills/nano-flow/SKILL.md": TOP_SKILL,
  "C:/project/.agents/skills/nano-flow/references/skills/to-story/SKILL.md": NESTED_SKILL,
  "C:/project/.agents/skills/a/b/c/SKILL.md": `---
name: deep-c
description: 更深一层
---

deep`,
  "C:/project/.agents/foo/SKILL.md": `---
name: foo-sk
description: .agents 直属目录
---

foo`,
  "C:/project/.agents/skills/nano-flow/references/skills/invalid/SKILL.md": "# 无 frontmatter",
  "C:/project/.agents/skills/nano-flow/references/skills/bad-name/SKILL.md": `---
name: To Story
description: 非法名
---

bad`,
  "C:/project/.agents/skills/nano-flow/node_modules/pkg/SKILL.md": `---
name: ignored-pkg
description: 排除目录
---

pkg`,
  "C:/project/.agents/skills/nano-flow/.hidden/h/SKILL.md": `---
name: hidden-h
description: 隐藏目录
---

hidden`,
};

const listNames = async (provider: NestedSkillProvider, cwd = "C:/project"): Promise<string[]> => {
  const candidates = await provider.list({ cwd });
  return candidates.map((candidate) => candidate.name).sort();
};

describe("NestedSkillProvider discovery", () => {
  it("finds nested skills at any depth and skips shipped one-layer forms", async () => {
    const provider = new NestedSkillProvider(
      fakeCtx,
      fakeControl(),
      { watch: false, includeUserRoots: false },
      memoryFs(FILES),
    );
    const candidates = await provider.list({ cwd: "C:/project" });
    const names = candidates.map((candidate) => candidate.name).sort();
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
    const candidates = await provider.list({ cwd: "C:/project" });
    const toStory = candidates.find((candidate) => candidate.name === "to-story");
    expect(toStory).toMatchObject({
      description: "讲述用户故事",
      whenToUse: "角色未明确时",
      provider: PROVIDER_NAME,
      source: "project-agents",
      rank: NESTED_SKILL_RANK,
      invocation: { modelInvocable: true, userInvocable: true },
      resourceBase: {
        kind: "directory",
        path: "C:/project/.agents/skills/nano-flow/references/skills/to-story",
      },
    });
    expect(toStory?.path).toBe(
      "C:/project/.agents/skills/nano-flow/references/skills/to-story/SKILL.md",
    );
  });

  it("sorts candidates deterministically by path", async () => {
    const provider = new NestedSkillProvider(
      fakeCtx,
      fakeControl(),
      { watch: false, includeUserRoots: false },
      memoryFs(FILES),
    );
    const candidates = await provider.list({ cwd: "C:/project" });
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
    const candidates = await provider.list({ cwd: "C:/project" });
    const toStory = candidates.find((candidate) => candidate.name === "to-story");
    const definition = await provider.get(toStory as SkillCandidateLike, {});
    expect(definition?.content).toBe("# 正文。");
    expect(definition?.source).toBe("project-agents");
    const missing = await provider.get(
      {
        ...(toStory as SkillCandidateLike),
        locator: { path: "C:/gone/SKILL.md", directory: "C:/gone" },
      },
      {},
    );
    expect(missing).toBeUndefined();
  });

  it("honors user roots and includeUserRoots", async () => {
    const userFiles = {
      ...FILES,
      "C:/home/.agents/team/references/skills/zz/SKILL.md": `---
name: user-zz
description: 用户嵌套
---

zz`,
    };
    const withUser = new NestedSkillProvider(
      fakeCtx,
      fakeControl(),
      { watch: false, agentsHome: "C:/home/.agents" },
      memoryFs(userFiles),
    );
    expect(await listNames(withUser)).toContain("user-zz");
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
      { watch: false, includeUserRoots: false, extraRoots: ["C:/ext"] },
      memoryFs({
        "C:/ext/team/x/SKILL.md": NESTED_SKILL.replace("to-story", "ext-x").replace(
          "讲述用户故事",
          "外部",
        ),
      }),
    );
    const candidates = await provider.list({ cwd: "C:/project" });
    const ext = candidates.find((candidate) => candidate.name === "ext-x");
    expect(ext?.source).toBe("custom");
  });

  it("invalidates on host mutations inside a scanned root only", async () => {
    const invalidate = vi.fn();
    const provider = new NestedSkillProvider(
      fakeCtx,
      fakeControl(invalidate),
      { watch: false, includeUserRoots: false },
      memoryFs(FILES),
    );
    await provider.list({ cwd: "C:/project" });
    provider.observeHostMutation("C:/project/.agents/skills/nano-flow/references/skills/to-story");
    provider.observeHostMutation("C:/project/.agents/skills/nano-flow/references");
    await flushTurns();
    expect(invalidate).toHaveBeenCalledTimes(1);
    provider.observeHostMutation("C:/elsewhere/file");
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
    await provider.list({ cwd: "C:/project" });
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
      "C:/project/.agents",
      memoryFs(FILES),
      new Set(["node_modules"]),
    );
    expect(files.map((file) => file.path).sort()).toEqual([
      "C:/project/.agents/foo/SKILL.md",
      "C:/project/.agents/skills/a/b/c/SKILL.md",
      "C:/project/.agents/skills/nano-flow/references/skills/bad-name/SKILL.md",
      "C:/project/.agents/skills/nano-flow/references/skills/invalid/SKILL.md",
      "C:/project/.agents/skills/nano-flow/references/skills/to-story/SKILL.md",
    ]);
  });

  it("finds the project root via .git presence", async () => {
    const fs = memoryFs({ "C:/project/.git": "" });
    expect(await findProjectRoot("C:/project", fs)).toBe("C:/project");
    expect(await findProjectRoot("C:/project/sub", fs)).toBe("C:/project");
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
    const before = await provider.list({ cwd: project });
    expect(before.map((candidate) => candidate.name)).toContain("to-story");
    await new Promise((resolve) => setTimeout(resolve, 500));
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
