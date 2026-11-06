import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { apply, Config, inject, name, TOOL_IDS } from "./index.js";
import { TOOLKIT_STATE_PATH, TOOLKIT_UNDO_PATH } from "./contract.js";
import { serviceOf } from "./host/services.js";

interface HarnessOptions {
  readonly connection?: boolean;
  readonly sessionControl?: boolean;
  readonly getThrows?: boolean;
  /** 归档集合里已有这些 id；`stored` 是有日志的，`live` 是仍存活的。 */
  readonly archiveSweep?: {
    readonly archived: readonly string[];
    readonly stored: readonly string[];
    readonly live: readonly string[];
  };
}

interface Harness {
  readonly ctx: Record<string, unknown>;
  readonly routes: Map<string, (request: Request) => Promise<Response>>;
  readonly providerNames: string[];
  readonly disposers: (() => void)[];
  readonly archived: string[];
  readonly unarchived: string[];
  readonly pinned: string[];
  readonly inserted: { sessionId: string; before: string | undefined }[];
  readonly emitted: (readonly [string, ...unknown[]])[];
  readonly warns: ReturnType<typeof vi.fn>;
}

const makeHarness = (options: HarnessOptions = {}): Harness => {
  const routes = new Map<string, (request: Request) => Promise<Response>>();
  const providerNames: string[] = [];
  const disposers: (() => void)[] = [];
  const archived: string[] = [];
  const unarchived: string[] = [];
  const pinned: string[] = [];
  const inserted: { sessionId: string; before: string | undefined }[] = [];
  const services: Record<string, unknown> = {
    connection:
      options.connection === false
        ? undefined
        : {
            fetch: {
              register: (route: {
                path: string;
                fetch: (request: Request) => Promise<Response>;
              }) => {
                routes.set(route.path, route.fetch);
                return () => routes.delete(route.path);
              },
            },
          },
  };
  if (options.sessionControl === true || options.archiveSweep !== undefined) {
    services["sessions"] = {
      get: () => ({
        snapshotEvents: () => [
          { type: "turn/start", seq: 0 },
          { type: "user/message", seq: 1, data: { content: [{ type: "text", text: "one" }] } },
          { type: "turn/end", seq: 2 },
          { type: "turn/start", seq: 3 },
          { type: "user/message", seq: 4, data: { content: [{ type: "text", text: "two" }] } },
        ],
      }),
    };
    services["sessionController"] = {
      fork: async () => ({ sessionId: "session-child" }),
    };
    services["workspaceRegistry"] = {
      list: () => [
        {
          sessionIds: ["session-source", "session-after"],
          insertSessionBefore: async (sessionId: string, before: string | undefined) => {
            inserted.push({ sessionId, before });
          },
          detachSession: async () => {},
        },
      ],
      archivedSessionIds: [...(options.archiveSweep?.archived ?? [])],
      get pinnedSessionIds() {
        return [...pinned];
      },
      unarchiveSession: async (sessionId: string) => {
        unarchived.push(sessionId);
      },
      archiveSession: async (sessionId: string) => {
        archived.push(sessionId);
        const index = pinned.indexOf(sessionId);
        if (index >= 0) pinned.splice(index, 1);
      },
      pinSession: async (sessionId: string) => {
        if (!pinned.includes(sessionId)) pinned.unshift(sessionId);
      },
      unpinSession: async (sessionId: string) => {
        const index = pinned.indexOf(sessionId);
        if (index >= 0) pinned.splice(index, 1);
      },
    };
  }
  if (options.archiveSweep !== undefined) {
    services["sessions"] = {
      get: (id: string) => (options.archiveSweep?.live.includes(id) === true ? {} : undefined),
    };
    services["sessionPersistence"] = {
      list: async () =>
        (options.archiveSweep?.stored ?? []).map((id: string) => ({ header: { id } })),
    };
  }
  const warns = vi.fn();
  const emitted: (readonly [string, ...unknown[]])[] = [];
  const ctx: Record<string, unknown> = {
    logger: { warn: warns, info: vi.fn() },
    emit: (event: string, ...args: unknown[]) => {
      emitted.push([event, ...args]);
    },
    get: (key: string) => {
      if (options.getThrows === true) throw new Error("no service access");
      return services[key];
    },
    effect: (callback: () => (() => void) | void) => {
      const dispose = callback();
      if (typeof dispose === "function") disposers.push(dispose);
      return () => {};
    },
    inject: (_deps: string[], callback: (child: unknown) => void) => {
      callback(ctx);
    },
    on: () => () => {},
    skills: {
      registerProvider: (
        create: (control: { signal: AbortSignal; invalidate: () => void }) => {
          name: string;
          dispose?: () => Promise<void>;
        },
      ) => {
        const provider = create({ signal: new AbortController().signal, invalidate: () => {} });
        providerNames.push(provider.name);
        return () => {
          providerNames.splice(providerNames.indexOf(provider.name), 1);
        };
      },
    },
  };
  return {
    ctx,
    routes,
    providerNames,
    disposers,
    archived,
    pinned,
    inserted,
    unarchived,
    emitted,
    warns,
  };
};

const workspaces: string[] = [];

const tempDir = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), "dsh-toolkit-"));
  workspaces.push(path);
  return path;
};

const post = (path: string, body: unknown): Request => {
  return new Request(`http://127.0.0.1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
};

/** 工具默认全部关闭：测试里先显式打开再用。 */
const enable = async (
  routes: Map<string, (request: Request) => Promise<Response>>,
  id: string,
): Promise<void> => {
  await routes.get(TOOLKIT_STATE_PATH)?.(post(TOOLKIT_STATE_PATH, { id, enabled: true }));
};

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
    await vi.waitFor(() => expect(routes.size).toBe(5));
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

  it("mounts the nested-skill provider once the tool is enabled", async () => {
    const directory = await tempDir();
    const { ctx, routes, providerNames } = makeHarness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(5));
    await enable(routes, "nested-skill");
    await vi.waitFor(() => expect(providerNames).toEqual(["nested-agents"]));
  });

  it("removes the provider when the nested-skill tool is switched off", async () => {
    const directory = await tempDir();
    const { ctx, routes, providerNames } = makeHarness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(5));
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
    await vi.waitFor(() => expect(first.routes.size).toBe(5));
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
    await vi.waitFor(() => expect(routes.size).toBe(5));
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
    await vi.waitFor(() => expect(routes.size).toBe(5));
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
    await vi.waitFor(() => expect(routes.size).toBe(5));
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
    await vi.waitFor(() => expect(routes.size).toBe(5));
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
