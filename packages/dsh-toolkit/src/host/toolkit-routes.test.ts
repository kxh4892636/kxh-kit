import { describe, expect, it, vi } from "vite-plus/test";
import { TOOLKIT_STATE_PATH, TOOLKIT_UNDO_PATH } from "../contract.js";
import { registerToolkitRoutes, type ToolkitRouteRegistry } from "./toolkit-routes.js";
import { ToolkitRegistry } from "./toolkit-registry.js";
import { ToolkitStateStore, type ToolkitStateIo } from "./toolkit-state.js";
import { UndoUnavailableError } from "./undo/undo-turn.js";

const memoryIo = (): ToolkitStateIo => {
  let text: string | undefined;
  return {
    async read() {
      return text;
    },
    async write(next) {
      text = next;
    },
  };
};

const setup = async () => {
  const routes = new Map<string, (request: Request) => Promise<Response>>();
  const connection: ToolkitRouteRegistry = {
    fetch: {
      register: (route) => {
        routes.set(route.path, route.fetch);
        return () => routes.delete(route.path);
      },
    },
  };
  const store = new ToolkitStateStore(memoryIo());
  const registry = new ToolkitRegistry({
    ctx: {} as never,
    tools: [
      {
        id: "nested-skill",
        title: "嵌套 skill 发现",
        description: "desc",
        defaultEnabled: true,
        apply: () => () => {},
      },
      {
        id: "undo-turn",
        title: "撤回",
        description: "desc",
        defaultEnabled: true,
        apply: () => () => {},
      },
    ],
    store,
    logger: { warn: vi.fn() },
  });
  await registry.initialize();
  const undo = {
    inspect: vi.fn(() => ({ available: true, prompt: "帮我改一下" })),
    run: vi.fn(async () => ({ childSessionId: "session-child", prompt: "帮我改一下" })),
  };
  const dispose = registerToolkitRoutes({
    registry,
    connection,
    undo,
    hiddenSessions: () => ["session-gone"],
    logger: { warn: vi.fn() },
  });
  const call = (path: string, request: Request): Promise<Response> => {
    const handler = routes.get(path);
    if (handler === undefined) throw new Error(`route ${path} not registered`);
    return handler(request);
  };
  return { call, registry, undo, dispose, routes };
};

const request = (
  path: string,
  init: { method?: string; body?: unknown; url?: string } = {},
): Request => {
  const url = init.url ?? `http://127.0.0.1:58683${path}`;
  const method = init.method ?? "GET";
  if (init.body === undefined) return new Request(url, { method });
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
};

describe("toolkit routes", () => {
  it("returns the tool catalog", async () => {
    const { call } = await setup();
    const response = await call(TOOLKIT_STATE_PATH, request(TOOLKIT_STATE_PATH));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { tools: { id: string; enabled: boolean }[] };
    expect(body.tools.map((tool) => `${tool.id}:${tool.enabled}`)).toEqual([
      "nested-skill:true",
      "undo-turn:true",
    ]);
  });

  it("toggles a tool and reflects it in the catalog", async () => {
    const { call, registry } = await setup();
    const response = await call(
      TOOLKIT_STATE_PATH,
      request(TOOLKIT_STATE_PATH, {
        method: "POST",
        body: { id: "nested-skill", enabled: false },
      }),
    );
    expect(response.status).toBe(200);
    expect(registry.isEnabled("nested-skill")).toBe(false);
  });

  it("rejects malformed toggle bodies and unknown tools", async () => {
    const { call } = await setup();
    const broken = await call(
      TOOLKIT_STATE_PATH,
      request(TOOLKIT_STATE_PATH, { method: "POST", body: "{oops" }),
    );
    expect(broken.status).toBe(400);
    const missing = await call(
      TOOLKIT_STATE_PATH,
      request(TOOLKIT_STATE_PATH, { method: "POST", body: { id: "a" } }),
    );
    expect(missing.status).toBe(400);
    const unknown = await call(
      TOOLKIT_STATE_PATH,
      request(TOOLKIT_STATE_PATH, { method: "POST", body: { id: "nope", enabled: true } }),
    );
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: "unknown-tool" });
  });

  it("inspects undo availability for a session", async () => {
    const { call, undo } = await setup();
    const response = await call(
      TOOLKIT_UNDO_PATH,
      request(TOOLKIT_UNDO_PATH, {
        url: `http://127.0.0.1:58683${TOOLKIT_UNDO_PATH}?sessionId=s1`,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true, prompt: "帮我改一下" });
    expect(undo.inspect).toHaveBeenCalledWith("s1");
  });

  it("rejects an undo probe without a session id", async () => {
    const { call } = await setup();
    const response = await call(TOOLKIT_UNDO_PATH, request(TOOLKIT_UNDO_PATH));
    expect(response.status).toBe(400);
  });

  it("runs undo and forwards unavailable reasons", async () => {
    const { call, undo } = await setup();
    const ok = await call(
      TOOLKIT_UNDO_PATH,
      request(TOOLKIT_UNDO_PATH, { method: "POST", body: { sessionId: "s1" } }),
    );
    expect(await ok.json()).toEqual({ childSessionId: "session-child", prompt: "帮我改一下" });

    undo.run.mockRejectedValueOnce(new UndoUnavailableError("no-previous-turn", "no earlier turn"));
    const failed = await call(
      TOOLKIT_UNDO_PATH,
      request(TOOLKIT_UNDO_PATH, { method: "POST", body: { sessionId: "s1" } }),
    );
    expect(failed.status).toBe(409);
    expect(await failed.json()).toMatchObject({ error: "no-previous-turn" });
  });

  it("refuses undo when the tool is disabled", async () => {
    const { call, registry } = await setup();
    await registry.setEnabled("undo-turn", false);
    const response = await call(
      TOOLKIT_UNDO_PATH,
      request(TOOLKIT_UNDO_PATH, { method: "POST", body: { sessionId: "s1" } }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "tool-disabled" });
  });

  it("reports an unsupported host and internal failures", async () => {
    const { call, undo } = await setup();
    undo.run.mockRejectedValueOnce(new Error("boom"));
    const internal = await call(
      TOOLKIT_UNDO_PATH,
      request(TOOLKIT_UNDO_PATH, { method: "POST", body: { sessionId: "s1" } }),
    );
    expect(internal.status).toBe(500);

    undo.run.mockRejectedValueOnce(
      new UndoUnavailableError("unsupported-host", "no session control"),
    );
    const unsupported = await call(
      TOOLKIT_UNDO_PATH,
      request(TOOLKIT_UNDO_PATH, { method: "POST", body: { sessionId: "s1" } }),
    );
    expect(await unsupported.json()).toMatchObject({ error: "unsupported-host" });
  });

  it("unregisters all routes on dispose", async () => {
    const { dispose, routes } = await setup();
    expect(routes.size).toBe(3);
    dispose();
    expect(routes.size).toBe(0);
  });
  it("lists the sessions that must stay hidden on the client", async () => {
    const { call } = await setup();
    const response = await call("/api/toolkit/hidden", new Request("http://x/api/toolkit/hidden"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ids: ["session-gone"] });
  });
});
