import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import { locateAssetsRoot } from "./assets.js";
import { createCheckTool } from "./tools/check.js";
import { createCreateTool } from "./tools/create.js";
import { createToolRuntime } from "./tools/shared.js";
import type { HostServices } from "./services.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "nano-flow-tools-"));
  roots.push(root);
  return root;
};

const services = {
  tools: { register: () => () => {} },
  systemPrompt: { section: () => () => {} },
  logger: { warn: () => {} },
  get: () => undefined,
  on: () => () => {},
} as unknown as HostServices;

const tools = (
  workspace: string,
  rebind?: (sessionId: string, planDirectory: string, workspace: string) => Promise<void>,
) => {
  const runtime = createToolRuntime({
    services,
    config: { workspace },
    settings: () => DEFAULT_NANO_FLOW_SETTINGS,
    assetsRoot: locateAssetsRoot(),
    domainRoot: ".agents/domains",
    ...(rebind === undefined ? {} : { rebind }),
  });
  return { create: createCreateTool(runtime), check: createCheckTool(runtime) };
};

const exec = (sessionId?: string) => ({
  signal: new AbortController().signal,
  ...(sessionId === undefined ? {} : { agent: { session: { id: sessionId } } }),
});

describe("nano_flow_create", () => {
  it("rejects invalid kinds and domain names", async () => {
    const { create } = tools(await makeRoot());
    await expect(create.execute({ kind: "nope", domain: "demo" }, exec())).rejects.toThrow(/kind/u);
    await expect(create.execute({ kind: "domain", domain: "Demo" }, exec())).rejects.toThrow(
      /kebab-case/u,
    );
  });

  it("rejects an invalid or existing plan", async () => {
    const workspace = await makeRoot();
    const { create } = tools(workspace);
    await expect(
      create.execute({ kind: "plan", domain: "demo", name: "not-a-plan" }, exec()),
    ).rejects.toThrow(/YYYY-MM-DD/u);
    await create.execute({ kind: "plan", domain: "demo", name: "2026-11-08-示例" }, exec());
    await expect(
      create.execute({ kind: "plan", domain: "demo", name: "2026-11-08-示例" }, exec()),
    ).rejects.toThrow(/已存在/u);
  });

  it("rejects a note without a name or title, and an existing note", async () => {
    const workspace = await makeRoot();
    const { create } = tools(workspace);
    await create.execute({ kind: "plan", domain: "demo", name: "2026-11-08-示例" }, exec());
    await expect(create.execute({ kind: "note", domain: "demo" }, exec())).rejects.toThrow(
      /name 或 title/u,
    );
    await create.execute(
      { kind: "note", domain: "demo", name: "001-甲", description: "甲。" },
      exec(),
    );
    await expect(
      create.execute({ kind: "note", domain: "demo", name: "001-甲" }, exec()),
    ).rejects.toThrow(/已存在/u);
  });

  it("is idempotent for domain files and supports plan lifecycle and auto-numbered notes", async () => {
    const workspace = await makeRoot();
    const { create } = tools(workspace);
    const first = String(await create.execute({ kind: "domain", domain: "demo" }, exec()));
    expect(first).toContain("新建");
    const second = String(await create.execute({ kind: "domain", domain: "demo" }, exec()));
    expect(second).toContain("已存在");

    const plan = String(
      await create.execute(
        { kind: "plan", domain: "demo", name: "2026-11-08-归档示例", lifecycle: "reference" },
        exec(),
      ),
    );
    expect(plan).toContain("reference");
    await expect(
      create.execute(
        { kind: "plan", domain: "demo", name: "2026-11-08-坏生命周期", lifecycle: "nope" },
        exec(),
      ),
    ).rejects.toThrow(/lifecycle/u);

    const firstNote = String(
      await create.execute(
        {
          kind: "note",
          domain: "demo",
          plan: "2026-11-08-归档示例",
          lifecycle: "reference",
          title: "甲",
          description: "甲。",
        },
        exec(),
      ),
    );
    expect(firstNote).toContain("001-甲.md");
    const secondNote = String(
      await create.execute(
        {
          kind: "note",
          domain: "demo",
          plan: "2026-11-08-归档示例",
          lifecycle: "reference",
          title: "乙",
          description: "乙。",
        },
        exec(),
      ),
    );
    expect(secondNote).toContain("002-乙.md");
  });
});

describe("nano_flow_check", () => {
  it("reports an unknown domain or plan", async () => {
    const workspace = await makeRoot();
    const { create, check } = tools(workspace);
    await create.execute({ kind: "domain", domain: "demo" }, exec());
    const domain = String(await check.execute({ domain: "nope" }, exec()));
    expect(domain).toContain("domain 不存在");
    const plan = String(await check.execute({ plan: "2026-11-08-不存在" }, exec()));
    expect(plan).toContain("Plan 不存在");
  });

  it("does not write a Plan binding itself", async () => {
    const workspace = await makeRoot();
    const calls: [string, string, string][] = [];
    const { create, check } = tools(workspace, async (sessionId, planDirectory, root) => {
      calls.push([sessionId, planDirectory, root]);
    });
    await create.execute({ kind: "plan", domain: "demo", name: "2026-11-08-甲" }, exec());
    await create.execute({ kind: "plan", domain: "demo", name: "2026-11-08-乙" }, exec());
    await create.execute(
      { kind: "plan", domain: "demo", name: "2026-11-08-丙", lifecycle: "reference" },
      exec(),
    );

    // 不带 plan 的唯一 active 启发式不再绑定。
    await check.execute({}, exec("session-a"));
    // 显式 plan 也只校验，不绑定。
    await check.execute({ plan: "2026-11-08-丙" }, exec("session-b"));
    expect(calls).toEqual([]);
  });

  it("downgrades legacy documents to warnings in non-strict mode", async () => {
    const workspace = await makeRoot();
    const { check } = tools(workspace);
    await mkdir(join(workspace, ".agents", "domains", "legacy", "questions"), { recursive: true });
    await writeFile(
      join(workspace, ".agents", "domains", "legacy", "CONTEXT.md"),
      "# 旧域\n\n没有 YAML 头。\n",
      "utf8",
    );
    const strict = String(await check.execute({}, exec()));
    expect(strict).toContain("校验失败");
    const loose = String(await check.execute({ strict: false }, exec()));
    expect(loose).toContain("校验通过");
    expect(loose).toContain("警告");
  });
});
