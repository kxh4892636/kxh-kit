import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "./config.ts";
import { createBindTool } from "./tools/bind.ts";
import { createCheckTool } from "./tools/check.ts";
import { createCreateTool } from "./tools/create.ts";
import type { NanoDeps } from "./tools/shared.ts";

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), "templates");
const created: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-nano-tools-"));
  created.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const deps = (
  bind: (planDirectory: string, workspace: string) => void = () => undefined,
): NanoDeps => ({
  settings: () => DEFAULT_NANO_FLOW_SETTINGS,
  templatesRoot: TEMPLATES,
  bind,
});

const run = async (
  tool: { execute?: (...args: never[]) => unknown },
  params: unknown,
  cwd: string,
): Promise<string> => {
  const result = (await tool.execute?.(
    "id" as never,
    params as never,
    undefined as never,
    undefined as never,
    { cwd } as never,
  )) as { content: { text: string }[] };
  return result.content[0]?.text ?? "";
};

describe("nano_flow_create", () => {
  it("scaffolds a domain, a plan, and a note without overwriting", async () => {
    const workspace = tempDir();
    const tool = createCreateTool(deps());

    await run(tool, { kind: "domain", domain: "demo", description: "演示域。" }, workspace);
    expect(existsSync(join(workspace, ".agents/domains/demo/CONTEXT.md"))).toBe(true);
    expect(existsSync(join(workspace, ".agents/domains/demo/questions/index.md"))).toBe(true);
    expect(existsSync(join(workspace, ".agents/domains/GUIDE.md"))).toBe(true);
    expect(existsSync(join(workspace, ".agents/domains/CONTEXT-MAP.md"))).toBe(true);

    const guide = join(workspace, ".agents/domains/GUIDE.md");
    writeFileSync(guide, "手写正文\n");
    await run(tool, { kind: "domain", domain: "demo" }, workspace);
    expect(readFileSync(guide, "utf8")).toBe("手写正文\n");

    const planName = "2026-11-09-示例";
    await run(tool, { kind: "plan", domain: "demo", name: planName }, workspace);
    const planDirectory = join(workspace, ".agents/domains/demo/plans/active", planName);
    expect(existsSync(join(planDirectory, "spec.md"))).toBe(true);
    expect(existsSync(join(planDirectory, "notes_index.md"))).toBe(true);

    await run(
      tool,
      { kind: "note", domain: "demo", title: "第一条", description: "说明。" },
      workspace,
    );
    const note = join(planDirectory, "001-第一条.md");
    expect(existsSync(note)).toBe(true);
    const text = readFileSync(note, "utf8");
    expect(text).toContain('name: "001-第一条"');
    expect(text).toContain("status: pending");
  });

  it("rejects an invalid plan name", async () => {
    const workspace = tempDir();
    const tool = createCreateTool(deps());
    await expect(
      run(tool, { kind: "plan", domain: "demo", name: "wrong-name" }, workspace),
    ).rejects.toThrow(/YYYY-MM-DD/u);
  });
});

describe("nano_flow_bind", () => {
  it("resolves the plan and hands its directory to the binding writer", async () => {
    const workspace = tempDir();
    await run(
      createCreateTool(deps()),
      { kind: "plan", domain: "demo", name: "2026-11-09-示例" },
      workspace,
    );
    const calls: Array<{ directory: string; workspace: string }> = [];
    const tool = createBindTool(
      deps((planDirectory, cwd) => calls.push({ directory: planDirectory, workspace: cwd })),
    );
    const text = await run(tool, { plan: "2026-11-09-示例" }, workspace);
    expect(text).toContain("demo/active/2026-11-09-示例");
    expect(calls).toEqual([
      {
        directory: join(workspace, ".agents/domains/demo/plans/active/2026-11-09-示例"),
        workspace,
      },
    ]);
  });
});

describe("nano_flow_check", () => {
  it("validates and regenerates indexes, then reports a broken note", async () => {
    const workspace = tempDir();
    const create = createCreateTool(deps());
    await run(create, { kind: "plan", domain: "demo", name: "2026-11-09-示例" }, workspace);
    await run(create, { kind: "note", domain: "demo", title: "第一条" }, workspace);
    const planDirectory = join(workspace, ".agents/domains/demo/plans/active/2026-11-09-示例");
    const note = join(planDirectory, "001-第一条.md");
    writeFileSync(
      note,
      "---\nname: 001-第一条\ndescription: 说明\nstatus: pending\nnext_step: 继续\n---\n\n正文\n",
    );
    const tool = createCheckTool(deps());
    const ok = await run(tool, { domain: "demo" }, workspace);
    expect(ok).toContain("校验通过");
    expect(existsSync(join(planDirectory, "notes_index.md"))).toBe(true);
    expect(readFileSync(join(planDirectory, "notes_index.md"), "utf8")).toContain("001-第一条");

    writeFileSync(note, "---\nname: 001-第一条\ndescription: 说明\nstatus: blocked\n---\n\n正文\n");
    const failed = await run(tool, { domain: "demo" }, workspace);
    expect(failed).toContain("校验失败");
    expect(failed).toContain("reason");
  });
});
