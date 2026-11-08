// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ClientContext } from "./contract.js";
import { followRotation, installRotationFollow, resetRotationFollow } from "./rotation-follow.js";
import { clearTombstones, tombstones } from "./tombstones.js";

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const ctxWith = (services: Record<string, unknown>): ClientContext =>
  ({
    slots: {} as never,
    get: (key: string) => services[key],
    effect: () => () => {},
  }) as unknown as ClientContext;

const rotationResponse = (from: string, to: string) =>
  json({ rotation: { from, to, at: "2026-11-08T09:00:00.000Z" } });

afterEach(() => {
  clearTombstones();
  resetRotationFollow();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** 导航选择 store 的替身：订阅、取值与手动触发变化。 */
const selectionStore = (initial?: string) => {
  let snapshot: { sessionId?: string } = initial === undefined ? {} : { sessionId: initial };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (next?: string) => {
      snapshot = next === undefined ? {} : { sessionId: next };
      for (const listener of listeners) listener();
    },
  };
};

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("followRotation", () => {
  it("hides the rotated row and opens the new session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rotationResponse("session-1", "session-2")),
    );
    const handleSessionRemoved = vi.fn();
    const refresh = vi.fn();
    const openSession = vi.fn(async () => undefined);
    const ctx = ctxWith({
      sessions: { handleSessionRemoved, refresh },
      uiWorkspace: { openSession },
    });

    await expect(followRotation(ctx, "session-1")).resolves.toBe(true);
    expect(handleSessionRemoved).toHaveBeenCalledWith("session-1");
    expect(openSession).toHaveBeenCalledWith("session-2");
    expect(tombstones()).toContain("session-1");
  });

  it("does nothing when the rotation belongs to another session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rotationResponse("session-other", "session-2")),
    );
    const openSession = vi.fn(async () => undefined);
    const ctx = ctxWith({ uiWorkspace: { openSession } });

    await expect(followRotation(ctx, "session-1")).resolves.toBe(false);
    expect(openSession).not.toHaveBeenCalled();
  });

  it("follows the same session only once", async () => {
    const fetchMock = vi.fn(async () => rotationResponse("session-1", "session-2"));
    vi.stubGlobal("fetch", fetchMock);
    const openSession = vi.fn(async () => undefined);
    const ctx = ctxWith({ uiWorkspace: { openSession } });

    expect(await followRotation(ctx, "session-1")).toBe(true);
    expect(await followRotation(ctx, "session-1")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(openSession).toHaveBeenCalledTimes(1);
  });

  it("stays put when the host route is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const openSession = vi.fn(async () => undefined);
    const ctx = ctxWith({ uiWorkspace: { openSession } });

    await expect(followRotation(ctx, "session-1")).resolves.toBe(false);
    expect(openSession).not.toHaveBeenCalled();
  });
});

describe("installRotationFollow", () => {
  it("follows when the archived current session leaves the selection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rotationResponse("session-1", "session-2")),
    );
    const handleSessionRemoved = vi.fn();
    const openSession = vi.fn(async () => undefined);
    const selection = selectionStore("session-1");
    const ctx = ctxWith({
      sessions: { handleSessionRemoved, refresh: vi.fn() },
      uiWorkspace: { openSession, selection },
    });
    const dispose = installRotationFollow(ctx);

    // 宿主归档旧会话 → 客户端 clearArchivedCurrent 清空当前选择。
    selection.emit();
    await tick();

    expect(openSession).toHaveBeenCalledWith("session-2");
    expect(handleSessionRemoved).toHaveBeenCalledWith("session-1");
    expect(tombstones()).toContain("session-1");
    dispose();
  });

  it("does not hijack a session the user opened by hand", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rotationResponse("session-1", "session-2")),
    );
    const openSession = vi.fn(async () => undefined);
    const selection = selectionStore("session-1");
    const ctx = ctxWith({ uiWorkspace: { openSession, selection } });
    const dispose = installRotationFollow(ctx);

    selection.emit("session-3");
    await tick();

    expect(openSession).not.toHaveBeenCalled();
    dispose();
  });

  it("ignores sessions that were not the rotated one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rotationResponse("session-other", "session-2")),
    );
    const openSession = vi.fn(async () => undefined);
    const selection = selectionStore("session-1");
    const ctx = ctxWith({ uiWorkspace: { openSession, selection } });
    const dispose = installRotationFollow(ctx);

    selection.emit();
    await tick();

    expect(openSession).not.toHaveBeenCalled();
    dispose();
  });

  it("retries opening the new session when the catalog has not listed it yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rotationResponse("session-1", "session-2")),
    );
    const openSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("sessions.retain: unknown session"))
      .mockResolvedValue(undefined);
    const selection = selectionStore("session-1");
    const ctx = ctxWith({ uiWorkspace: { openSession, selection } });
    const dispose = installRotationFollow(ctx);

    selection.emit();
    await tick();
    expect(openSession).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(openSession).toHaveBeenCalledTimes(2);
    expect(openSession).toHaveBeenLastCalledWith("session-2");
    dispose();
  });

  it("abandons the switch when the user moves during the retry window", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rotationResponse("session-1", "session-2")),
    );
    const openSession = vi.fn().mockRejectedValue(new Error("unknown session"));
    const selection = selectionStore("session-1");
    const ctx = ctxWith({ uiWorkspace: { openSession, selection } });
    const dispose = installRotationFollow(ctx);

    selection.emit();
    await tick();
    expect(openSession).toHaveBeenCalledTimes(1);
    selection.emit("session-3");
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(openSession).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("warns but keeps the follow unrecorded when the catalog never lists the new session", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rotationResponse("session-1", "session-2")),
    );
    const openSession = vi.fn().mockRejectedValue(new Error("unknown session"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const selection = selectionStore("session-1");
    const ctx = ctxWith({ uiWorkspace: { openSession, selection } });
    const dispose = installRotationFollow(ctx);

    selection.emit();
    await vi.advanceTimersByTimeAsync(3000);

    expect(openSession).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalled();
    dispose();
    warn.mockRestore();
  });

  it("falls back to polling when the selection store cannot subscribe", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rotationResponse("session-1", "session-2")),
    );
    const openSession = vi.fn(async () => undefined);
    let snapshot: { sessionId?: string } = { sessionId: "session-1" };
    const ctx = ctxWith({
      uiWorkspace: { openSession, selection: { getSnapshot: () => snapshot } },
    });
    const dispose = installRotationFollow(ctx);

    snapshot = {};
    await vi.advanceTimersByTimeAsync(500);

    expect(openSession).toHaveBeenCalledWith("session-2");
    dispose();
  });
});
