import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { apply, Config, inject, name, TOOL_IDS } from "./index.js";
import { TOOLKIT_NANO_FLOW_NOTES_PATH, TOOLKIT_STATE_PATH, TOOLKIT_UNDO_PATH } from "./contract.js";
import { NANO_FLOW_SERVICE } from "./host/nano-flow-facade.js";
import { serviceOf } from "./host/services.js";
import { makeHarness, tempDir, post, enable, workspaces } from "./index.test-support.js";

afterEach(async () => {
  for (const path of workspaces.splice(0)) {
    await rm(path, { recursive: true, force: true });
  }
});

describe("toolkit plugin entry", () => {
  it("declares identity and config schema", () => {
    expect(name).toBe("toolkit");
    expect(inject).toEqual(["skills"]);
    expect(TOOL_IDS).toEqual({
      nestedSkill: "nested-skill",
      undoTurn: "undo-turn",
      officeSkills: "office-skills",
      nanoFlow: "nano-flow",
    });
    const parsed = Config({ agentsHome: "/tmp/agents", extraRoots: ["/x"] });
    expect(parsed.watch).toBe(true);
    expect(parsed.agentsHome).toBe("/tmp/agents");
    expect(parsed.extraRoots).toEqual(["/x"]);
  });

  it("starts with every tool switched off", async () => {
    const directory = await tempDir();
    const { ctx, routes, providerNames } = makeHarness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    expect(providerNames).toEqual([]);
    const state = await routes.get(TOOLKIT_STATE_PATH)?.(
      new Request(`http://127.0.0.1${TOOLKIT_STATE_PATH}`),
    );
    const body = (await state?.json()) as { tools: { id: string; enabled: boolean }[] };
    expect(body.tools.map((tool) => `${tool.id}:${tool.enabled}`)).toEqual([
      "nested-skill:false",
      "undo-turn:false",
      "office-skills:false",
      "nano-flow:false",
    ]);
  });

  it("serves the nano-flow notes snapshot for a live session", async () => {
    const directory = await tempDir();
    const plan = join(directory, ".agents", "domains", "dsh", "plans", "active", "2026-11-08-演示");
    await mkdir(plan, { recursive: true });
    await writeFile(
      join(plan, "001-第一个.md"),
      "---\nname: '001-第一个'\ndescription: '概述'\nstatus: pending\n---\n",
      "utf8",
    );
    const bindings = join(directory, "bindings.json");
    const { ctx, routes } = makeHarness({ notesSession: { id: "session-1", cwd: directory } });
    apply(ctx as never, {
      stateFile: join(directory, "state.json"),
      sessionsRoot: directory,
      bindingsFile: bindings,
    });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    // 未绑定 Plan 的会话不显示面板。
    const unbound = await routes.get(TOOLKIT_NANO_FLOW_NOTES_PATH)?.(
      new Request(`http://127.0.0.1${TOOLKIT_NANO_FLOW_NOTES_PATH}?sessionId=session-1`),
    );
    await expect(unbound?.json()).resolves.toEqual({ snapshot: null });

    await writeFile(
      bindings,
      JSON.stringify({
        "session-1": {
          planPath: ".agents/domains/dsh/plans/active/2026-11-08-演示",
          cwd: directory,
          boundAt: "2026-11-08T00:00:00.000Z",
        },
      }),
      "utf8",
    );
    const response = await routes.get(TOOLKIT_NANO_FLOW_NOTES_PATH)?.(
      new Request(`http://127.0.0.1${TOOLKIT_NANO_FLOW_NOTES_PATH}?sessionId=session-1`),
    );
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      snapshot: {
        planName: "2026-11-08-演示",
        planPath: ".agents/domains/dsh/plans/active/2026-11-08-演示",
        notes: [{ name: "001-第一个", status: "pending", description: "概述" }],
      },
    });

    const missing = await routes.get(TOOLKIT_NANO_FLOW_NOTES_PATH)?.(
      new Request(`http://127.0.0.1${TOOLKIT_NANO_FLOW_NOTES_PATH}?sessionId=session-2`),
    );
    await expect(missing?.json()).resolves.toEqual({ snapshot: null });
  });

  it("resolves the notes snapshot from the workspace when the bound cwd is gone", async () => {
    const directory = await tempDir();
    const plan = join(directory, ".agents", "domains", "dsh", "plans", "active", "2026-11-09-迁移");
    await mkdir(plan, { recursive: true });
    await writeFile(
      join(plan, "001-第一个.md"),
      "---\nname: '001-第一个'\ndescription: '概述'\nstatus: pending\n---\n",
      "utf8",
    );
    const bindings = join(directory, "bindings.json");
    const { ctx, routes } = makeHarness({ notesSession: { id: "session-1", cwd: directory } });
    apply(ctx as never, {
      stateFile: join(directory, "state.json"),
      sessionsRoot: directory,
      bindingsFile: bindings,
    });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    await writeFile(
      bindings,
      JSON.stringify({
        "session-1": {
          planPath: ".agents/domains/dsh/plans/active/2026-11-09-迁移",
          cwd: join(directory, "gone"),
          boundAt: "2026-11-09T00:00:00.000Z",
        },
      }),
      "utf8",
    );
    const response = await routes.get(TOOLKIT_NANO_FLOW_NOTES_PATH)?.(
      new Request(`http://127.0.0.1${TOOLKIT_NANO_FLOW_NOTES_PATH}?sessionId=session-1`),
    );
    expect(await response?.json()).toMatchObject({
      snapshot: { planName: "2026-11-09-迁移" },
    });
  });

  it("prunes bindings of sessions the host no longer has when a session binds", async () => {
    const directory = await tempDir();
    const plan = join(directory, ".agents", "domains", "dsh", "plans", "active", "2026-11-09-演示");
    await mkdir(plan, { recursive: true });
    const bindings = join(directory, "bindings.json");
    const dead = {
      planPath: ".agents/domains/dsh/plans/active/2026-11-09-演示",
      cwd: directory,
      boundAt: "2026-11-08T00:00:00.000Z",
    };
    await writeFile(bindings, JSON.stringify({ ghost: dead, ghost2: dead }), "utf8");
    const { ctx, routes, provided } = makeHarness({ persistence: { stored: ["session-1"] } });
    apply(ctx as never, {
      stateFile: join(directory, "state.json"),
      sessionsRoot: directory,
      bindingsFile: bindings,
    });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    const facade = provided[NANO_FLOW_SERVICE] as {
      rebindSession(id: string, plan: string, workspace: string): Promise<void>;
    };
    await facade.rebindSession("session-1", plan, directory);
    const table = JSON.parse(await readFile(bindings, "utf8")) as Record<string, unknown>;
    expect(Object.keys(table)).toEqual(["session-1"]);
  });

  it("keeps bindings of sessions that are alive but not persisted yet", async () => {
    const directory = await tempDir();
    const plan = join(
      directory,
      ".agents",
      "domains",
      "dsh",
      "plans",
      "active",
      "2026-11-09-活会话",
    );
    await mkdir(plan, { recursive: true });
    const bindings = join(directory, "bindings.json");
    const entry = {
      planPath: ".agents/domains/dsh/plans/active/2026-11-09-活会话",
      cwd: directory,
      boundAt: "2026-11-08T00:00:00.000Z",
    };
    await writeFile(bindings, JSON.stringify({ "live-1": entry, ghost: entry }), "utf8");
    const { ctx, routes, provided } = makeHarness({
      persistence: { stored: [] },
      liveSessions: ["live-1"],
    });
    apply(ctx as never, {
      stateFile: join(directory, "state.json"),
      sessionsRoot: directory,
      bindingsFile: bindings,
    });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    const facade = provided[NANO_FLOW_SERVICE] as {
      rebindSession(id: string, plan: string, workspace: string): Promise<void>;
    };
    await facade.rebindSession("session-1", plan, directory);
    const table = JSON.parse(await readFile(bindings, "utf8")) as Record<string, unknown>;
    expect(Object.keys(table).sort()).toEqual(["live-1", "session-1"]);
  });

  it("keeps every binding when the host cannot list sessions", async () => {
    const directory = await tempDir();
    const plan = join(
      directory,
      ".agents",
      "domains",
      "dsh",
      "plans",
      "active",
      "2026-11-09-无列表",
    );
    await mkdir(plan, { recursive: true });
    const bindings = join(directory, "bindings.json");
    const entry = {
      planPath: ".agents/domains/dsh/plans/active/2026-11-09-无列表",
      cwd: directory,
      boundAt: "2026-11-08T00:00:00.000Z",
    };
    await writeFile(bindings, JSON.stringify({ ghost: entry }), "utf8");
    const { ctx, routes, provided } = makeHarness();
    apply(ctx as never, {
      stateFile: join(directory, "state.json"),
      sessionsRoot: directory,
      bindingsFile: bindings,
    });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    const facade = provided[NANO_FLOW_SERVICE] as {
      rebindSession(id: string, plan: string, workspace: string): Promise<void>;
    };
    await facade.rebindSession("session-1", plan, directory);
    const table = JSON.parse(await readFile(bindings, "utf8")) as Record<string, unknown>;
    expect(Object.keys(table).sort()).toEqual(["ghost", "session-1"]);
  });

  it("keeps every binding when the session list throws", async () => {
    const directory = await tempDir();
    const plan = join(directory, ".agents", "domains", "dsh", "plans", "active", "2026-11-09-抛错");
    await mkdir(plan, { recursive: true });
    const bindings = join(directory, "bindings.json");
    const entry = {
      planPath: ".agents/domains/dsh/plans/active/2026-11-09-抛错",
      cwd: directory,
      boundAt: "2026-11-08T00:00:00.000Z",
    };
    await writeFile(bindings, JSON.stringify({ ghost: entry }), "utf8");
    const { ctx, routes, provided, warns } = makeHarness({
      persistence: { stored: [], fail: true },
    });
    apply(ctx as never, {
      stateFile: join(directory, "state.json"),
      sessionsRoot: directory,
      bindingsFile: bindings,
    });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    const facade = provided[NANO_FLOW_SERVICE] as {
      rebindSession(id: string, plan: string, workspace: string): Promise<void>;
    };
    await facade.rebindSession("session-1", plan, directory);
    const table = JSON.parse(await readFile(bindings, "utf8")) as Record<string, unknown>;
    expect(Object.keys(table).sort()).toEqual(["ghost", "session-1"]);
    expect(warns).toHaveBeenCalled();
  });

  it("keeps bindings when the host lists no sessions", async () => {
    const directory = await tempDir();
    const plan = join(directory, ".agents", "domains", "dsh", "plans", "active", "2026-11-09-空表");
    await mkdir(plan, { recursive: true });
    const bindings = join(directory, "bindings.json");
    await writeFile(
      bindings,
      JSON.stringify({
        kept: {
          planPath: ".agents/domains/dsh/plans/active/2026-11-09-空表",
          cwd: directory,
          boundAt: "2026-11-08T00:00:00.000Z",
        },
      }),
      "utf8",
    );
    const { ctx, routes, provided } = makeHarness({ persistence: { stored: [] } });
    apply(ctx as never, {
      stateFile: join(directory, "state.json"),
      sessionsRoot: directory,
      bindingsFile: bindings,
    });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    const facade = provided[NANO_FLOW_SERVICE] as {
      rebindSession(id: string, plan: string, workspace: string): Promise<void>;
    };
    await facade.rebindSession("session-1", plan, directory);
    const table = JSON.parse(await readFile(bindings, "utf8")) as Record<string, unknown>;
    expect(Object.keys(table).sort()).toEqual(["kept", "session-1"]);
  });

  it("mounts the nested-skill provider once the tool is enabled", async () => {
    const directory = await tempDir();
    const { ctx, routes, providerNames } = makeHarness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    await enable(routes, "nested-skill");
    await vi.waitFor(() => expect(providerNames).toEqual(["nested-agents"]));
  });

  it("removes the provider when the nested-skill tool is switched off", async () => {
    const directory = await tempDir();
    const { ctx, routes, providerNames } = makeHarness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    await enable(routes, "nested-skill");
    await vi.waitFor(() => expect(providerNames).toEqual(["nested-agents"]));

    const response = await routes.get(TOOLKIT_STATE_PATH)?.(
      post(TOOLKIT_STATE_PATH, { id: "nested-skill", enabled: false }),
    );
    expect(response?.status).toBe(200);
    expect(providerNames).toEqual([]);
  });

  it("persists the switch so a remount starts from it", async () => {
    const directory = await tempDir();
    const stateFile = join(directory, "state.json");
    const first = makeHarness();
    apply(first.ctx as never, { stateFile, sessionsRoot: directory });
    await vi.waitFor(() => expect(first.routes.size).toBe(6));
    await enable(first.routes, "nested-skill");
    await vi.waitFor(() => expect(first.providerNames).toHaveLength(1));

    const second = makeHarness();
    apply(second.ctx as never, { stateFile, sessionsRoot: directory });
    await vi.waitFor(() => expect(second.providerNames).toEqual(["nested-agents"]));
  });

  it("reports undo as unsupported when the host has no session control", async () => {
    const directory = await tempDir();
    const { ctx, routes } = makeHarness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    await enable(routes, "undo-turn");
    const response = await routes.get(TOOLKIT_UNDO_PATH)?.(
      new Request(`http://127.0.0.1${TOOLKIT_UNDO_PATH}?sessionId=session-1`),
    );
    expect(await response?.json()).toEqual({ available: false, reason: "unsupported-host" });
  });

  it("runs undo through the composed host services and keeps the source placement", async () => {
    const directory = await tempDir();
    const { ctx, routes, archived, emitted, inserted, pinned } = makeHarness({
      sessionControl: true,
    });
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    await enable(routes, "undo-turn");
    pinned.push("session-source", "session-other");

    const undone = await routes.get(TOOLKIT_UNDO_PATH)?.(
      post(TOOLKIT_UNDO_PATH, { sessionId: "session-source" }),
    );
    expect(await undone?.json()).toEqual({ childSessionId: "session-child", prompt: "two" });
    expect(archived).toEqual(["session-source"]);
    // 记账位置：插到原会话的后继之前；置顶位：顶替原会话在置顶集合里的序号。
    expect(inserted).toEqual([{ sessionId: "session-child", before: "session-after" }]);
    expect(pinned).toEqual(["session-child", "session-other"]);
    // 宿主侧广播「会话已移除」，客户端据此把行摘掉（存活会话仍会被 session/list 列出）。
    expect(emitted).toContainEqual(["api-session/removed", "session-source"]);
    await vi.waitFor(async () => {
      const handler = routes.get("/api/toolkit/hidden");
      const hidden = await handler?.(new Request("http://x/api/toolkit/hidden"));
      await expect(hidden?.json()).resolves.toEqual({ ids: ["session-source"] });
    });
  });

  it("drops archived ids whose session no longer exists", async () => {
    const directory = await tempDir();
    const { ctx, routes, unarchived } = makeHarness({
      archiveSweep: { archived: ["ghost", "kept", "live"], stored: ["kept"], live: ["live"] },
    });
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    // 只有既不在持久化、也不存活的 id 会被从归档集合里摘掉。
    await vi.waitFor(() => expect(unarchived).toEqual(["ghost"]));
  });

  it("skips routes when the host exposes no connection registry", async () => {
    const directory = await tempDir();
    const { ctx, routes, providerNames } = makeHarness({ connection: false });
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(routes.size).toBe(0);
    expect(providerNames).toEqual([]);
  });

  it("keeps running when the state file cannot be read", async () => {
    const { ctx, warns } = makeHarness();
    apply(ctx as never, {
      stateFile: join(tmpdir(), "dsh-toolkit-unwritable\u0000", "state.json"),
      sessionsRoot: join(tmpdir(), "dsh-toolkit-unwritable"),
    });
    await vi.waitFor(() => expect(warns).toHaveBeenCalled());
  });

  it("unwinds the provider on plugin dispose", async () => {
    const directory = await tempDir();
    const { ctx, routes, providerNames, disposers } = makeHarness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(6));
    await enable(routes, "nested-skill");
    await vi.waitFor(() => expect(providerNames).toEqual(["nested-agents"]));
    for (const dispose of disposers) dispose();
    await vi.waitFor(() => expect(providerNames).toEqual([]));
  });

  it("treats an unreadable service table as unsupported", () => {
    const { ctx } = makeHarness({ getThrows: true });
    expect(serviceOf(ctx as { get(key: string): unknown }, "connection")).toBeUndefined();
    expect(() =>
      apply(ctx as never, { stateFile: join(tmpdir(), "x", "state.json"), sessionsRoot: tmpdir() }),
    ).not.toThrow();
  });
});
