import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../../contract.js";
import { locateAssetsRoot } from "../session/assets.js";
import { createBindTool } from "./bind.js";
import { createCreateTool } from "./create.js";
import { createToolRuntime } from "../session/tool-runtime.js";
import type { HostServices } from "../session/services.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const services = {
  tools: { register: () => () => {} },
  systemPrompt: { section: () => () => {} },
  logger: { warn: () => {} },
  get: () => undefined,
  on: () => () => {},
} as unknown as HostServices;

const exec = (sessionId?: string) => ({
  signal: new AbortController().signal,
  ...(sessionId === undefined ? {} : { agent: { session: { id: sessionId } } }),
});

const makeHarness = async () => {
  const workspace = await mkdtemp(join(tmpdir(), "nano-flow-bind-"));
  roots.push(workspace);
  const calls: [string, string, string][] = [];
  const runtime = createToolRuntime({
    services,
    config: { workspace },
    settings: () => DEFAULT_NANO_FLOW_SETTINGS,
    assetsRoot: locateAssetsRoot(),
    domainRoot: ".agents/domains",
    rebind: async (sessionId, planDirectory, root) => {
      calls.push([sessionId, planDirectory, root]);
    },
  });
  return {
    workspace,
    calls,
    create: createCreateTool(runtime),
    bind: createBindTool(runtime),
  };
};

const planDirectory = (workspace: string, lifecycle: string, name: string, domain = "demo") =>
  join(workspace, ".agents", "domains", domain, "plans", lifecycle, name);

describe("nano_flow_bind", () => {
  it("binds and switches the same session across plans and lifecycles", async () => {
    const { workspace, calls, create, bind } = await makeHarness();
    await create.execute({ kind: "plan", domain: "demo", name: "2026-11-08-甲" }, exec());
    await create.execute(
      { kind: "plan", domain: "demo", name: "2026-11-08-乙", lifecycle: "reference" },
      exec(),
    );

    const first = String(await bind.execute({ plan: "2026-11-08-甲" }, exec("session-x")));
    expect(first).toContain("demo/active/2026-11-08-甲");
    const second = String(await bind.execute({ plan: "2026-11-08-乙" }, exec("session-x")));
    expect(second).toContain("demo/reference/2026-11-08-乙");

    expect(calls).toEqual([
      ["session-x", planDirectory(workspace, "active", "2026-11-08-甲"), workspace],
      ["session-x", planDirectory(workspace, "reference", "2026-11-08-乙"), workspace],
    ]);
  });

  it("uses domain to disambiguate plans with the same directory name", async () => {
    const { workspace, calls, create, bind } = await makeHarness();
    await create.execute({ kind: "plan", domain: "alpha", name: "2026-11-08-同名" }, exec());
    await create.execute({ kind: "plan", domain: "beta", name: "2026-11-08-同名" }, exec());

    await expect(bind.execute({ plan: "2026-11-08-同名" }, exec("s"))).rejects.toThrow(
      /多个同名 Plan/u,
    );
    const text = String(await bind.execute({ plan: "2026-11-08-同名", domain: "beta" }, exec("s")));
    expect(text).toContain("beta/active/2026-11-08-同名");
    expect(calls).toEqual([
      ["s", planDirectory(workspace, "active", "2026-11-08-同名", "beta"), workspace],
    ]);
  });

  it("rejects unknown plans, invalid lifecycles and missing sessions", async () => {
    const { create, bind } = await makeHarness();
    await create.execute({ kind: "plan", domain: "demo", name: "2026-11-08-甲" }, exec());

    await expect(bind.execute({ plan: "2026-11-08-不存在" }, exec("s"))).rejects.toThrow(
      /找不到 Plan/u,
    );
    await expect(
      bind.execute({ plan: "2026-11-08-甲", lifecycle: "nope" }, exec("s")),
    ).rejects.toThrow(/lifecycle/u);
    await expect(bind.execute({ plan: "2026-11-08-甲" }, exec())).rejects.toThrow(
      /无法确定当前会话/u,
    );
  });
});
