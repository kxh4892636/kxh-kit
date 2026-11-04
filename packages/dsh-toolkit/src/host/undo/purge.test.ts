import { describe, expect, it, vi } from "vite-plus/test";
import { deleteSessionLogs, runPendingPurge, type SessionLogIo } from "./purge.js";
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
    async removeDir(path) {
      const target = normalize(path);
      for (const candidate of Array.from(paths)) {
        if (candidate === target || candidate.startsWith(`${target}/`)) paths.delete(candidate);
      }
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

  it("clears the queue after a successful delete", async () => {
    const store = new ToolkitStateStore(memoryStateIo());
    await store.load();
    await store.addPendingDelete("session-1");
    const io = memoryLogIo(["/sessions/workspace-a/session-1/session.v4.jsonl.zstd"]);
    const result = await runPendingPurge(store, "/sessions", { warn: vi.fn() }, io);
    expect(result.deleted).toEqual(["session-1"]);
    expect(store.snapshot().pendingDeletes).toEqual([]);
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
      async removeDir() {},
    };
    const result = await runPendingPurge(store, "/sessions", { warn }, io);
    expect(result.retained).toEqual(["session-1"]);
    expect(store.snapshot().pendingDeletes).toEqual(["session-1"]);
    expect(warn).toHaveBeenCalled();
  });
});
