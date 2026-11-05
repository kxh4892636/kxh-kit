import { describe, expect, it, vi } from "vite-plus/test";
import {
  deleteSessionLogs,
  runPendingPurge,
  runPendingUnarchive,
  type RemoveOutcome,
  type SessionLogIo,
} from "./purge.js";
import { ToolkitStateStore, type ToolkitStateIo } from "../toolkit-state.js";

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

/** 目录树替身：`path` 是相对会话日志根的形式；比较前统一成正斜杠。 */
const normalize = (path: string): string => path.replace(/\\/gu, "/");

const memoryLogIo = (initial: readonly string[]): SessionLogIo & { readonly paths: string[] } => {
  const paths = new Set(initial.map(normalize));
  return {
    async listDirs(path) {
      const prefix = `${normalize(path).replace(/\/+$/u, "")}/`;
      const names = new Set<string>();
      for (const candidate of paths) {
        if (!candidate.startsWith(prefix)) continue;
        const rest = candidate.slice(prefix.length);
        const [first] = rest.split("/");
        if (first !== undefined && first !== "") names.add(first);
      }
      return [...names];
    },
    async removeDir(path): Promise<RemoveOutcome> {
      const target = normalize(path);
      let removed: RemoveOutcome = "absent";
      for (const candidate of Array.from(paths)) {
        if (candidate === target || candidate.startsWith(`${target}/`)) {
          paths.delete(candidate);
          removed = "removed";
        }
      }
      return removed;
    },
    get paths() {
      return Array.from(paths);
    },
  };
};

describe("deleteSessionLogs", () => {
  it("removes the session directory under every workspace slug", async () => {
    const io = memoryLogIo([
      "/sessions/workspace-a/session-1/session.v4.jsonl.zstd",
      "/sessions/workspace-b/session-1/session.v4.jsonl.zstd",
      "/sessions/workspace-a/session-2/session.v4.jsonl.zstd",
    ]);
    const result = await deleteSessionLogs("/sessions", ["session-1"], io);
    expect(result).toEqual({ deleted: ["session-1"], retained: [] });
    expect(io.paths).toEqual(["/sessions/workspace-a/session-2/session.v4.jsonl.zstd"]);
  });

  it("walks workspace slugs that start with dashes (real host layout)", async () => {
    // 宿主把项目路径编码成 `--C-Users-...--` 形式的 slug 目录；用会话 id 的严格规则过滤会把
    // 它们全部跳过，删除退化成空操作——这正是「撤回后原会话还在」的根因。
    const io = memoryLogIo([
      "/sessions/--C-Users-kxh-projects-x--/session-1/session.v4.jsonl.zstd",
      "/sessions/--C-Users-kxh-projects-y--/session-1/session.v4.jsonl.zstd",
    ]);
    const result = await deleteSessionLogs("/sessions", ["session-1"], io);
    expect(result).toEqual({ deleted: ["session-1"], retained: [] });
    expect(io.paths).toEqual([]);
  });

  it("skips traversal-shaped slug names", async () => {
    const io = memoryLogIo(["/sessions/../session-1/session.v4.jsonl.zstd"]);
    await deleteSessionLogs("/sessions", ["session-1"], io);
    // `..` 被拒绝，因此那条路径不会被删。
    expect(io.paths).toHaveLength(1);
  });

  it("rejects ids that are not directory-safe and retains them", async () => {
    const io = memoryLogIo([]);
    const result = await deleteSessionLogs("/sessions", ["../escape"], io);
    expect(result).toEqual({ deleted: [], retained: ["../escape"] });
  });

  it("retains an id whose removal throws", async () => {
    const io: SessionLogIo = {
      async listDirs() {
        return ["workspace-a"];
      },
      async removeDir() {
        throw new Error("locked");
      },
    };
    await expect(deleteSessionLogs("/sessions", ["session-1"], io)).resolves.toEqual({
      deleted: [],
      retained: ["session-1"],
    });
  });
});

describe("runPendingPurge", () => {
  it("does nothing when the queue is empty", async () => {
    const store = new ToolkitStateStore(memoryStateIo());
    await store.load();
    const io = memoryLogIo([]);
    await expect(runPendingPurge(store, "/sessions", { warn: vi.fn() }, io)).resolves.toEqual({
      deleted: [],
      retained: [],
    });
  });

  it("clears the queue after a successful delete and queues the archive cleanup", async () => {
    const store = new ToolkitStateStore(memoryStateIo());
    await store.load();
    await store.addPendingDelete("session-1");
    const io = memoryLogIo(["/sessions/workspace-a/session-1/session.v4.jsonl.zstd"]);
    const result = await runPendingPurge(store, "/sessions", { warn: vi.fn() }, io);
    expect(result.deleted).toEqual(["session-1"]);
    expect(store.snapshot().pendingDeletes).toEqual([]);
    expect(store.snapshot().pendingUnarchives).toEqual(["session-1"]);
  });

  it("归档集合可用时直接把 id 摘掉，不排队", async () => {
    const store = new ToolkitStateStore(memoryStateIo());
    await store.load();
    await store.addPendingDelete("session-1");
    const io = memoryLogIo(["/sessions/workspace-a/session-1/session.v4.jsonl.zstd"]);
    const unarchive = vi.fn(async () => {});
    await runPendingPurge(store, "/sessions", { warn: vi.fn() }, io, unarchive);
    expect(unarchive).toHaveBeenCalledWith("session-1");
    expect(store.snapshot().pendingUnarchives).toEqual([]);
  });

  it("撤销归档失败时排进待撤销清单", async () => {
    const store = new ToolkitStateStore(memoryStateIo());
    await store.load();
    await store.addPendingDelete("session-1");
    const io = memoryLogIo(["/sessions/workspace-a/session-1/session.v4.jsonl.zstd"]);
    const unarchive = vi.fn(async () => {
      throw new Error("registry busy");
    });
    await runPendingPurge(store, "/sessions", { warn: vi.fn() }, io, unarchive);
    expect(store.snapshot().pendingUnarchives).toEqual(["session-1"]);
  });

  it("keeps failed ids queued and reports them", async () => {
    const store = new ToolkitStateStore(memoryStateIo());
    await store.load();
    await store.addPendingDelete("session-1");
    const warn = vi.fn();
    const io: SessionLogIo = {
      async listDirs() {
        return ["workspace-a"];
      },
      async removeDir() {
        throw new Error("locked");
      },
    };
    await runPendingPurge(store, "/sessions", { warn }, io);
    expect(store.snapshot().pendingDeletes).toEqual(["session-1"]);
    expect(warn).toHaveBeenCalled();
  });

  it("keeps the queue when listing the root fails", async () => {
    const store = new ToolkitStateStore(memoryStateIo());
    await store.load();
    await store.addPendingDelete("session-1");
    const warn = vi.fn();
    const io: SessionLogIo = {
      async listDirs() {
        throw new Error("root unreadable");
      },
      async removeDir() {
        return "removed" as const;
      },
    };
    const result = await runPendingPurge(store, "/sessions", { warn }, io);
    expect(result.retained).toEqual(["session-1"]);
    expect(store.snapshot().pendingDeletes).toEqual(["session-1"]);
    expect(warn).toHaveBeenCalled();
  });

  it("把待撤销归档清单跑完并清空", async () => {
    const store = new ToolkitStateStore(memoryStateIo());
    await store.load();
    await store.addPendingUnarchive("session-1");
    const unarchive = vi.fn(async () => {});
    await expect(runPendingUnarchive(store, unarchive, { warn: vi.fn() })).resolves.toEqual([
      "session-1",
    ]);
    expect(store.snapshot().pendingUnarchives).toEqual([]);
  });

  it("撤销归档失败的 id 留到下次启动", async () => {
    const store = new ToolkitStateStore(memoryStateIo());
    await store.load();
    await store.addPendingUnarchive("session-1");
    const unarchive = vi.fn(async () => {
      throw new Error("busy");
    });
    const warn = vi.fn();
    await runPendingUnarchive(store, unarchive, { warn });
    expect(store.snapshot().pendingUnarchives).toEqual(["session-1"]);
    expect(warn).toHaveBeenCalled();
  });
});
