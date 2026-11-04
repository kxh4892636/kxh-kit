import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  HostSession,
  HostSessionController,
  HostSessionEvent,
  HostSessionStore,
  HostWorkspaceRecord,
  HostWorkspaceRegistry,
} from "../services.js";
import { ToolkitStateStore, type ToolkitStateIo } from "../toolkit-state.js";
import type { SessionLogIo } from "./purge.js";
import { inspectUndo, UndoUnavailableError, undoTurn, type UndoDeps } from "./undo-turn.js";

const memoryStateIo = (): ToolkitStateIo => {
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

const log = (): HostSessionEvent[] => [
  { type: "turn/start", seq: 0, data: { turn: 1 } },
  {
    type: "user/message",
    seq: 1,
    data: { content: [{ type: "text", text: "一" }], source: { kind: "user" } },
  },
  { type: "turn/end", seq: 2, data: { turn: 1 } },
  { type: "turn/start", seq: 3, data: { turn: 2 } },
  {
    type: "user/message",
    seq: 4,
    data: { content: [{ type: "text", text: "二" }], source: { kind: "user" } },
  },
];

interface SetupOptions {
  readonly live?: boolean;
  readonly archiveFails?: boolean;
  readonly detachFails?: boolean;
  readonly retainLogs?: boolean;
}

const setup = async (options: SetupOptions = {}) => {
  let liveCalls = 0;
  const session: HostSession = { snapshotEvents: () => log() };
  const sessions: HostSessionStore = {
    get: () => {
      liveCalls += 1;
      // `live` 缺省时始终存活；显式 false 时第一次查询后模拟「撤销后会话已被释放」。
      if (options.live !== false) return session;
      return liveCalls === 1 ? session : undefined;
    },
  };
  const fork = vi.fn(async () => ({ sessionId: "session-child" }));
  const controller: HostSessionController = { fork };
  const detachSession = options.detachFails
    ? vi.fn(async () => {
        throw new Error("detach failed");
      })
    : vi.fn(async () => {});
  const record: HostWorkspaceRecord = { sessionIds: ["session-source"], detachSession };
  const archiveSession = options.archiveFails
    ? vi.fn(async () => {
        throw new Error("archive failed");
      })
    : vi.fn(async () => {});
  const workspaces: HostWorkspaceRegistry = {
    list: () => [record],
    archiveSession,
  };
  const store = new ToolkitStateStore(memoryStateIo());
  await store.load();
  const removed: string[] = [];
  const logIo: SessionLogIo = {
    async listDirs() {
      return ["workspace-a"];
    },
    async removeDir(path) {
      if (options.retainLogs === true) throw new Error("locked");
      removed.push(path);
    },
  };
  const warn = vi.fn();
  const deps: UndoDeps = {
    sessions,
    controller,
    workspaces,
    store,
    sessionsRoot: "/sessions",
    logger: { warn },
    logIo,
  };
  return { deps, fork, archiveSession, detachSession, store, removed, warn };
};

describe("inspectUndo", () => {
  it("reports the prompt of the last turn", async () => {
    const { deps } = await setup();
    expect(inspectUndo(deps, "session-source")).toEqual({ available: true, prompt: "二" });
  });

  it("reports a session that is not live", async () => {
    const { deps } = await setup();
    const missing: HostSessionStore = { get: () => undefined };
    expect(inspectUndo({ ...deps, sessions: missing }, "x")).toEqual({
      available: false,
      reason: "session-not-live",
    });
  });

  it("reports a session with a single turn", async () => {
    const { deps } = await setup();
    const single: HostSessionStore = {
      get: () => ({ snapshotEvents: () => log().slice(0, 3) }),
    };
    expect(inspectUndo({ ...deps, sessions: single }, "x")).toEqual({
      available: false,
      reason: "no-previous-turn",
    });
  });
});

describe("undoTurn", () => {
  it("forks at the previous turn end, archives, detaches and queues the delete", async () => {
    const { deps, fork, archiveSession, detachSession, store } = await setup();
    const result = await undoTurn(deps, "session-source");
    expect(result).toEqual({ childSessionId: "session-child", prompt: "二" });
    expect(fork).toHaveBeenCalledWith({ sessionId: "session-source", atSeq: 2 });
    expect(archiveSession).toHaveBeenCalledWith("session-source", { stopActivity: true });
    expect(detachSession).toHaveBeenCalledWith("session-source");
    // 第一次查询仍返回存活会话，因此删除推迟到下次启动。
    expect(store.snapshot().pendingDeletes).toEqual(["session-source"]);
  });

  it("deletes the log directory when the session is already gone", async () => {
    const { deps, removed, store } = await setup({ live: false });
    await undoTurn(deps, "session-source");
    expect(removed).toEqual([join("/sessions", "workspace-a", "session-source")]);
    expect(store.snapshot().pendingDeletes).toEqual([]);
  });

  it("keeps the deletion queued when the log directory is locked", async () => {
    const { deps, store } = await setup({ live: false, retainLogs: true });
    await undoTurn(deps, "session-source");
    expect(store.snapshot().pendingDeletes).toEqual(["session-source"]);
  });

  it("does not queue a delete when archiving fails", async () => {
    const { deps, store, detachSession, archiveSession } = await setup({ archiveFails: true });
    const result = await undoTurn(deps, "session-source");
    expect(result.childSessionId).toBe("session-child");
    expect(archiveSession).toHaveBeenCalled();
    expect(detachSession).not.toHaveBeenCalled();
    expect(store.snapshot().pendingDeletes).toEqual([]);
  });

  it("tolerates a detach failure", async () => {
    const { deps, warn } = await setup({ detachFails: true });
    await expect(undoTurn(deps, "session-source")).resolves.toMatchObject({
      childSessionId: "session-child",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('detach of "session-source" failed'));
  });

  it("works without a workspace registry", async () => {
    const { deps, store } = await setup();
    const result = await undoTurn({ ...deps, workspaces: undefined }, "session-source");
    expect(result.childSessionId).toBe("session-child");
    expect(store.snapshot().pendingDeletes).toEqual([]);
  });

  it("throws a reason when the turn cannot be undone", async () => {
    const { deps } = await setup();
    const missing: HostSessionStore = { get: () => undefined };
    await expect(undoTurn({ ...deps, sessions: missing }, "x")).rejects.toBeInstanceOf(
      UndoUnavailableError,
    );
    await expect(undoTurn({ ...deps, sessions: missing }, "x")).rejects.toMatchObject({
      reason: "session-not-live",
    });
  });
});
