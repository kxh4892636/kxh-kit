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
  readonly placeFails?: boolean;
  readonly retainLogs?: boolean;
  readonly pinned?: readonly string[];
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
  const inserted: { sessionId: string; before: string | undefined }[] = [];
  const insertSessionBefore = options.placeFails
    ? vi.fn(async () => {
        throw new Error("insert failed");
      })
    : vi.fn(async (sessionId: string, before: string | undefined) => {
        inserted.push({ sessionId, before });
      });
  const detachSession = vi.fn(async () => {});
  const record: HostWorkspaceRecord = {
    sessionIds: ["session-source", "session-after"],
    insertSessionBefore,
    detachSession,
  };
  const pinned = [...(options.pinned ?? [])];
  const archiveSession = options.archiveFails
    ? vi.fn(async () => {
        throw new Error("archive failed");
      })
    : vi.fn(async (sessionId: string) => {
        // 与宿主一致：归档会顺手把该会话从置顶集合里摘掉。
        const index = pinned.indexOf(sessionId);
        if (index >= 0) pinned.splice(index, 1);
      });
  const pinSession = vi.fn(async (sessionId: string) => {
    if (!pinned.includes(sessionId)) pinned.unshift(sessionId);
  });
  const unpinSession = vi.fn(async (sessionId: string) => {
    const index = pinned.indexOf(sessionId);
    if (index >= 0) pinned.splice(index, 1);
  });
  const unarchived: string[] = [];
  const unarchiveSession = vi.fn(async (sessionId: string) => {
    unarchived.push(sessionId);
  });
  const workspaces: HostWorkspaceRegistry = {
    list: () => [record],
    archivedSessionIds: [],
    get pinnedSessionIds() {
      return [...pinned];
    },
    archiveSession,
    pinSession,
    unpinSession,
    unarchiveSession,
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
  return {
    deps,
    detachSession,
    fork,
    archiveSession,
    insertSessionBefore,
    inserted,
    pinSession,
    unpinSession,
    unarchiveSession,
    unarchived,
    pinned,
    store,
    removed,
    warn,
  };
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
  it("forks at the previous turn end, archives, keeps the slot and queues the delete", async () => {
    const { deps, fork, archiveSession, insertSessionBefore, store } = await setup();
    const result = await undoTurn(deps, "session-source");
    expect(result).toEqual({ childSessionId: "session-child", prompt: "二" });
    expect(fork).toHaveBeenCalledWith({ sessionId: "session-source", atSeq: 2 });
    expect(archiveSession).toHaveBeenCalledWith("session-source", { stopActivity: true });
    // 记账位置：插到原会话原来的后继之前（而不是被 fork 默认前插）。
    expect(insertSessionBefore).toHaveBeenCalledWith("session-child", "session-after");
    // 第一次查询仍返回存活会话，因此删除推迟到下次启动。
    expect(store.snapshot().pendingDeletes).toEqual(["session-source"]);
  });

  it("takes over the pin slot of the source session", async () => {
    const { deps, pinned, pinSession, unpinSession } = await setup({
      pinned: ["session-other", "session-source", "session-third"],
    });
    await undoTurn(deps, "session-source");
    expect(unpinSession).toHaveBeenCalled();
    // 子会话顶替原会话在置顶集合里的序号。
    expect(pinned).toEqual(["session-other", "session-child", "session-third"]);
    expect(pinSession).toHaveBeenCalledWith("session-child");
  });

  it("leaves pinning alone when the source was not pinned", async () => {
    const { deps, pinned, pinSession } = await setup({ pinned: ["session-other"] });
    await undoTurn(deps, "session-source");
    expect(pinSession).not.toHaveBeenCalled();
    expect(pinned).toEqual(["session-other"]);
  });

  it("完全删除：摘记账、删日志、撤销归档，不留占位", async () => {
    const { deps, removed, store, detachSession, unarchiveSession, unarchived } = await setup({
      live: false,
    });
    await undoTurn(deps, "session-source");
    expect(detachSession).toHaveBeenCalledWith("session-source");
    expect(removed).toEqual([join("/sessions", "workspace-a", "session-source")]);
    expect(unarchiveSession).toHaveBeenCalledWith("session-source");
    expect(unarchived).toEqual(["session-source"]);
    expect(store.snapshot().pendingDeletes).toEqual([]);
    expect(store.snapshot().pendingUnarchives).toEqual([]);
  });

  it("会话仍存活时：摘记账、日志与撤销归档都排队到下次启动", async () => {
    const { deps, store, detachSession, unarchiveSession } = await setup();
    await undoTurn(deps, "session-source");
    expect(detachSession).toHaveBeenCalledWith("session-source");
    expect(store.snapshot().pendingDeletes).toEqual(["session-source"]);
    expect(unarchiveSession).not.toHaveBeenCalled();
  });

  it("keeps the deletion queued when the log directory is locked", async () => {
    const { deps, store } = await setup({ live: false, retainLogs: true });
    await undoTurn(deps, "session-source");
    expect(store.snapshot().pendingDeletes).toEqual(["session-source"]);
  });

  it("does not queue a delete when archiving fails", async () => {
    const { deps, store, insertSessionBefore, archiveSession } = await setup({
      archiveFails: true,
    });
    const result = await undoTurn(deps, "session-source");
    expect(result.childSessionId).toBe("session-child");
    expect(archiveSession).toHaveBeenCalled();
    expect(insertSessionBefore).not.toHaveBeenCalled();
    expect(store.snapshot().pendingDeletes).toEqual([]);
  });

  it("tolerates a placement failure", async () => {
    const { deps, warn } = await setup({ placeFails: true });
    await expect(undoTurn(deps, "session-source")).resolves.toMatchObject({
      childSessionId: "session-child",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('placing "session-child" failed'));
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
