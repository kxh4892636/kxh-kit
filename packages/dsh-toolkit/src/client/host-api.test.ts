import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  fetchHiddenSessions,
  fetchNanoFlowReady,
  fetchToolkitState,
  fetchUndoAvailability,
  HostApiError,
  runUndoTurn,
  setToolEnabled,
} from "./host-api.js";

const tool = (id: string, enabled: boolean) => ({
  id,
  title: id,
  description: `${id} tool`,
  enabled,
});

const json = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("host api", () => {
  it("reads the catalog from a document-relative route", async () => {
    const fetchMock = vi.fn(async () => json({ tools: [tool("nested-skill", true)] }));
    vi.stubGlobal("fetch", fetchMock);
    const tools = await fetchToolkitState();
    expect(tools).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith("api/toolkit/state", expect.anything());
  });

  it("posts a toggle as JSON", async () => {
    const fetchMock = vi.fn(async () => json({ tools: [tool("undo-turn", false)] }));
    vi.stubGlobal("fetch", fetchMock);
    const tools = await setToolEnabled("undo-turn", false);
    expect(tools[0]?.enabled).toBe(false);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"id":"undo-turn","enabled":false}');
  });

  it("surfaces host error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "unknown-tool", message: "nope" }, 400)),
    );
    await expect(setToolEnabled("nope", true)).rejects.toMatchObject({
      code: "unknown-tool",
      status: 400,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 502 })),
    );
    await expect(fetchToolkitState()).rejects.toBeInstanceOf(HostApiError);
  });

  it("rejects payloads that do not match the catalog shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ tools: "nope" })),
    );
    await expect(fetchToolkitState()).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("encodes the session id in the availability probe", async () => {
    const fetchMock = vi.fn(async () => json({ available: true, prompt: "hi" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchUndoAvailability("session a/b")).resolves.toEqual({
      available: true,
      prompt: "hi",
    });
    const [target] = fetchMock.mock.calls[0] as unknown as [string];
    expect(target).toBe("api/toolkit/undo-turn?sessionId=session%20a%2Fb");
  });

  it("normalizes odd availability payloads to unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ available: "yes", reason: 42 })),
    );
    await expect(fetchUndoAvailability("s1")).resolves.toEqual({ available: false });
  });

  it("runs undo and validates the result", async () => {
    const fetchMock = vi.fn(async () => json({ childSessionId: "session-child", prompt: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(runUndoTurn("s1")).resolves.toEqual({
      childSessionId: "session-child",
      prompt: "x",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ prompt: "x" })),
    );
    await expect(runUndoTurn("s1")).rejects.toMatchObject({ code: "invalid-response" });
  });
  it("reads the hidden session ids", async () => {
    const fetchMock = vi.fn(async (_input: string) => json({ ids: ["session-a", "session-b"] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchHiddenSessions()).resolves.toEqual(["session-a", "session-b"]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("api/toolkit/hidden");
  });

  it("parses waiting in the ready payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          available: true,
          plan: { domain: "dsh", lifecycle: "active", name: "2026-11-07-示例工作" },
          counts: {
            total: 1,
            pending: 0,
            in_progress: 0,
            waiting: 1,
            needsBlocked: 0,
            completed: 0,
          },
          groups: [
            {
              notes: [
                {
                  id: "01",
                  title: "等真机",
                  description: "代码已完成",
                  status: "waiting",
                  needs: "review",
                  blocked_by: [],
                },
              ],
            },
          ],
        }),
      ),
    );
    const ready = await fetchNanoFlowReady("s1");
    expect(ready.counts?.waiting).toBe(1);
    expect(ready.groups?.[0]?.notes[0]?.status).toBe("waiting");
    expect(ready.groups?.[0]?.notes[0]?.needs).toBe("review");
  });

  it("treats an unreachable hidden route as empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "not-found", message: "nope" }, 404)),
    );
    await expect(fetchHiddenSessions()).resolves.toEqual([]);
  });
});
