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
}

interface Harness {
  readonly ctx: Record<string, unknown>;
  readonly routes: Map<string, (request: Request) => Promise<Response>>;
  readonly providerNames: string[];
  readonly disposers: (() => void)[];
  readonly archived: string[];
  readonly detached: string[];
  readonly warns: ReturnType<typeof vi.fn>;
}

const harness = (options: HarnessOptions = {}): Harness => {
  const routes = new Map<string, (request: Request) => Promise<Response>>();
  const providerNames: string[] = [];
  const disposers: (() => void)[] = [];
  const archived: string[] = [];
  const detached: string[] = [];
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
  if (options.sessionControl === true) {
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
          sessionIds: ["session-source"],
          detachSession: async (sessionId: string) => {
            detached.push(sessionId);
          },
        },
      ],
      archiveSession: async (sessionId: string) => {
        archived.push(sessionId);
      },
    };
  }
  const warns = vi.fn();
  const catalog = [
    {
      name: "office-docx",
      description: "word documents",
      invocation: { modelInvocable: true, userInvocable: true },
      source: "bundled",
      provider: "dsh-office",
    },
    {
      name: "code-spec",
      description: "coding rules",
      invocation: { modelInvocable: true, userInvocable: true },
      source: "project-agents",
      provider: "nested-agents",
    },
  ];
  const ctx: Record<string, unknown> = {
    logger: { warn: warns, info: vi.fn() },
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
      list: async () => [...catalog],
      snapshot: async () => ({ skills: [...catalog], complete: true }),
      get: async (skillName: string) => {
        const match = catalog.find((skill) => skill.name === skillName);
        return match === undefined ? undefined : { ...match, content: `${skillName} body` };
      },
    },
  };
  // cordis 的服务是 `ctx.get(name)` 取到的；`ctx.skills` 只是同一实例的语法糖。
  services["skills"] = ctx["skills"];
  return { ctx, routes, providerNames, disposers, archived, detached, warns };
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
    });
    const parsed = Config({ agentsHome: "/tmp/agents", extraRoots: ["/x"] });
    expect(parsed.watch).toBe(true);
    expect(parsed.agentsHome).toBe("/tmp/agents");
    expect(parsed.extraRoots).toEqual(["/x"]);
  });

  it("mounts the nested-skill provider and both host routes", async () => {
    const directory = await tempDir();
    const { ctx, routes, providerNames } = harness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });

    await vi.waitFor(() => expect(providerNames).toEqual(["nested-agents"]));
    expect([...routes.keys()].sort()).toEqual([TOOLKIT_STATE_PATH, TOOLKIT_UNDO_PATH].sort());

    const state = await routes.get(TOOLKIT_STATE_PATH)?.(
      new Request(`http://127.0.0.1${TOOLKIT_STATE_PATH}`),
    );
    const body = (await state?.json()) as { tools: { id: string; enabled: boolean }[] };
    expect(body.tools.map((tool) => tool.id)).toEqual([
      "nested-skill",
      "undo-turn",
      "office-skills",
    ]);
  });

  it("removes the provider when the nested-skill tool is switched off", async () => {
    const directory = await tempDir();
    const { ctx, routes, providerNames } = harness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(providerNames).toEqual(["nested-agents"]));

    const response = await routes.get(TOOLKIT_STATE_PATH)?.(
      post(TOOLKIT_STATE_PATH, { id: "nested-skill", enabled: false }),
    );
    expect(response?.status).toBe(200);
    expect(providerNames).toEqual([]);
  });

  it("masks the built-in office skills while the office tool is on", async () => {
    const directory = await tempDir();
    const { ctx, routes } = harness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(2));
    const skills = ctx["skills"] as {
      snapshot(): Promise<{ skills: { name: string }[] }>;
      get(name: string): Promise<unknown>;
    };
    const visible = async (): Promise<string[]> =>
      (await skills.snapshot()).skills.map((skill) => skill.name);

    expect(await visible()).toEqual(["office-docx", "code-spec"]);

    const on = await routes.get(TOOLKIT_STATE_PATH)?.(
      post(TOOLKIT_STATE_PATH, { id: "office-skills", enabled: true }),
    );
    expect(on?.status).toBe(200);
    expect(await visible()).toEqual(["code-spec"]);
    expect(await skills.get("office-docx")).toBeUndefined();
    expect(await skills.get("code-spec")).toBeDefined();

    await routes.get(TOOLKIT_STATE_PATH)?.(
      post(TOOLKIT_STATE_PATH, { id: "office-skills", enabled: false }),
    );
    expect(await visible()).toEqual(["office-docx", "code-spec"]);
  });

  it("persists the switch so a remount starts from it", async () => {
    const directory = await tempDir();
    const stateFile = join(directory, "state.json");
    const first = harness();
    apply(first.ctx as never, { stateFile, sessionsRoot: directory });
    await vi.waitFor(() => expect(first.providerNames).toHaveLength(1));
    await first.routes.get(TOOLKIT_STATE_PATH)?.(
      post(TOOLKIT_STATE_PATH, { id: "nested-skill", enabled: false }),
    );

    const second = harness();
    apply(second.ctx as never, { stateFile, sessionsRoot: directory });
    await vi.waitFor(() => expect(second.routes.size).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(second.providerNames).toEqual([]);
  });

  it("reports undo as unsupported when the host has no session control", async () => {
    const directory = await tempDir();
    const { ctx, routes } = harness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(2));
    const response = await routes.get(TOOLKIT_UNDO_PATH)?.(
      new Request(`http://127.0.0.1${TOOLKIT_UNDO_PATH}?sessionId=session-1`),
    );
    expect(await response?.json()).toEqual({ available: false, reason: "unsupported-host" });
  });

  it("runs undo through the composed host services", async () => {
    const directory = await tempDir();
    const { ctx, routes, archived, detached } = harness({ sessionControl: true });
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(routes.size).toBe(2));

    const probe = await routes.get(TOOLKIT_UNDO_PATH)?.(
      new Request(`http://127.0.0.1${TOOLKIT_UNDO_PATH}?sessionId=session-source`),
    );
    expect(await probe?.json()).toEqual({ available: true, prompt: "two" });

    const undone = await routes.get(TOOLKIT_UNDO_PATH)?.(
      post(TOOLKIT_UNDO_PATH, { sessionId: "session-source" }),
    );
    expect(await undone?.json()).toEqual({ childSessionId: "session-child", prompt: "two" });
    expect(archived).toEqual(["session-source"]);
    expect(detached).toEqual(["session-source"]);
  });

  it("skips routes when the host exposes no connection registry", async () => {
    const directory = await tempDir();
    const { ctx, routes, providerNames } = harness({ connection: false });
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(providerNames).toEqual(["nested-agents"]));
    expect(routes.size).toBe(0);
  });

  it("keeps running when the state file cannot be read", async () => {
    const { ctx, providerNames, warns } = harness();
    apply(ctx as never, {
      stateFile: join(tmpdir(), "dsh-toolkit-unwritable\u0000", "state.json"),
      sessionsRoot: join(tmpdir(), "dsh-toolkit-unwritable"),
    });
    await vi.waitFor(() => expect(warns).toHaveBeenCalled());
    expect(providerNames).toEqual([]);
  });

  it("unwinds the provider on plugin dispose", async () => {
    const directory = await tempDir();
    const { ctx, providerNames, disposers } = harness();
    apply(ctx as never, { stateFile: join(directory, "state.json"), sessionsRoot: directory });
    await vi.waitFor(() => expect(providerNames).toEqual(["nested-agents"]));
    for (const dispose of disposers) dispose();
    await vi.waitFor(() => expect(providerNames).toEqual([]));
  });

  it("treats an unreadable service table as unsupported", () => {
    const { ctx } = harness({ getThrows: true });
    expect(serviceOf(ctx as { get(key: string): unknown }, "connection")).toBeUndefined();
    expect(() =>
      apply(ctx as never, { stateFile: join(tmpdir(), "x", "state.json"), sessionsRoot: tmpdir() }),
    ).not.toThrow();
  });
});
