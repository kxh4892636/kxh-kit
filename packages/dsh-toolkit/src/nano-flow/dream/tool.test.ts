import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../../contract.js";
import { locateAssetsRoot } from "../session/assets.js";
import { createDreamTool } from "./tool.js";
import { createToolRuntime } from "../session/tool-runtime.js";
import type { HostServices } from "../session/services.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "nano-flow-dream-tool-"));
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

const PLAN_PATH = ".agents/domains/demo/plans/active/2026-01-01-示例";

const writeLog = async (workspace: string): Promise<void> => {
  const directory = join(workspace, PLAN_PATH);
  await mkdir(directory, { recursive: true });
  const header = JSON.stringify({
    type: "session",
    v: 1,
    sessionId: "session-a",
    planPath: PLAN_PATH,
  });
  const turn = JSON.stringify({
    type: "turn",
    v: 1,
    sessionId: "session-a",
    turn: 1,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
    user: "做点什么",
    assistant: "好",
    tools: [],
    usage: {},
    seq: [4, 533],
  });
  await writeFile(join(directory, "log.jsonl"), [header, turn].join("\n") + "\n", "utf8");
};

const tool = (workspace: string) => {
  const runtime = createToolRuntime({
    services,
    config: { workspace },
    settings: () => DEFAULT_NANO_FLOW_SETTINGS,
    assetsRoot: locateAssetsRoot(),
    domainRoot: ".agents/domains",
  });
  return createDreamTool(runtime);
};

const exec = { signal: new AbortController().signal };

describe("nano_flow_dream", () => {
  it("scans new turns with the default state path", async () => {
    const workspace = await makeRoot();
    await writeLog(workspace);
    const statePath = join(workspace, "cursor.json");
    const output = String(await tool(workspace).execute({ action: "scan", statePath }, exec));
    expect(output).toContain(PLAN_PATH);
    expect(output).toContain("新增 1 个 turn");
    expect(output).toContain("turn 1");
  });

  it("marks a plan and session, then reports no new turns", async () => {
    const workspace = await makeRoot();
    await writeLog(workspace);
    const statePath = join(workspace, "cursor.json");
    const dream = tool(workspace);
    const marked = String(
      await dream.execute(
        {
          action: "mark",
          statePath,
          marks: [{ planPath: PLAN_PATH, sessionId: "session-a", seq: 533 }],
        },
        exec,
      ),
    );
    expect(marked).toContain("已推进游标");
    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      plans: Record<string, { sessions: Record<string, { lastSeq: number }> }>;
    };
    expect(state.plans[PLAN_PATH]?.sessions["session-a"]?.lastSeq).toBe(533);
    const output = String(await dream.execute({ action: "scan", statePath }, exec));
    expect(output).toContain("没有新增 turn");
  });

  it("rejects unknown actions and malformed marks", async () => {
    const workspace = await makeRoot();
    await writeLog(workspace);
    const dream = tool(workspace);
    const statePath = join(workspace, "cursor.json");
    await expect(dream.execute({ action: "nope", statePath }, exec)).rejects.toThrow(/action/u);
    await expect(dream.execute({ action: "mark", statePath }, exec)).rejects.toThrow(/marks/u);
    await expect(
      dream.execute({ action: "mark", statePath, marks: [{ planPath: PLAN_PATH }] }, exec),
    ).rejects.toThrow(/sessionId/u);
    await expect(
      dream.execute(
        { action: "mark", statePath, marks: [{ planPath: PLAN_PATH, sessionId: "s", seq: -1 }] },
        exec,
      ),
    ).rejects.toThrow(/seq/u);
  });
});
