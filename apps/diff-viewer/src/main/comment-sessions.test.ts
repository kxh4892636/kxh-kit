import { describe, it, expect, vi } from "vitest";

import type { DiffCommentThread, DiffSelection } from "../types/diff.js";

import {
  createCommentSessionStore,
  parseCommentPushBody,
  type CommentSessionSnapshot,
} from "./comment-sessions.js";

const selection: DiffSelection = { baseCommitish: "main", targetCommitish: "feature" };

const makeThread = (id: string, body: string): DiffCommentThread => ({
  id,
  filePath: "a.txt",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  position: { side: "new", line: 1 },
  messages: [
    {
      id,
      body,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
});

describe("comment-sessions", () => {
  it("replaceThreads 创建会话并递增版本", () => {
    const store = createCommentSessionStore();

    const first = store.replaceThreads(selection, [makeThread("t1", "one")]);
    expect(first.version).toBe(1);
    expect(first.merged).toBe(false);

    const second = store.replaceThreads(selection, [
      makeThread("t1", "one"),
      makeThread("t2", "two"),
    ]);
    expect(second.version).toBe(2);

    expect(store.getSession(selection).threads.map((thread) => thread.id)).toEqual(["t1", "t2"]);
  });

  it("内容未变化时不递增版本", () => {
    const store = createCommentSessionStore();
    store.replaceThreads(selection, [makeThread("t1", "one")]);

    const again = store.replaceThreads(selection, [makeThread("t1", "one")]);
    expect(again.version).toBe(1);
  });

  it("baseVersion 陈旧时 merge 而非覆盖", () => {
    const store = createCommentSessionStore();
    store.replaceThreads(selection, [makeThread("t1", "one")]);

    // 客户端基于 version 0 推送, 与服务端 version 1 不一致 → merge
    const result = store.replaceThreads(selection, [makeThread("t2", "two")], 0);
    expect(result.merged).toBe(true);
    expect(result.threads.map((thread) => thread.id).sort()).toEqual(["t1", "t2"]);
  });

  it("会话按对比隔离", () => {
    const store = createCommentSessionStore();
    store.replaceThreads(selection, [makeThread("t1", "one")]);

    const other: DiffSelection = { baseCommitish: "HEAD^", targetCommitish: "HEAD" };
    expect(store.getSession(other).threads).toEqual([]);
    expect(store.getSession(other).version).toBe(0);
  });

  it("deleteThread 移除已有 thread, 未知 id 返回 found=false", () => {
    const store = createCommentSessionStore();
    store.replaceThreads(selection, [makeThread("t1", "one"), makeThread("t2", "two")]);

    const removed = store.deleteThread(selection, "t1");
    expect(removed.found).toBe(true);
    expect(store.getSession(selection).threads.map((thread) => thread.id)).toEqual(["t2"]);

    expect(store.deleteThread(selection, "missing").found).toBe(false);
  });

  it("formatOutput 输出 Markdown 列表, 空会话输出空串", () => {
    const store = createCommentSessionStore();
    expect(store.formatOutput(selection)).toBe("");

    store.replaceThreads(selection, [makeThread("t1", "hello world")]);
    const output = store.formatOutput(selection);
    expect(output).toContain("a.txt");
    expect(output).toContain("hello world");
  });

  it("评论变化时触发 onChanged 回调", () => {
    const versions: number[] = [];
    const store = createCommentSessionStore((_sel, version) => {
      versions.push(version);
    });

    store.replaceThreads(selection, [makeThread("t1", "one")]);
    store.deleteThread(selection, "t1");
    expect(versions).toEqual([1, 2]);
  });

  it("parseCommentPushBody 解析 threads 与 baseVersion", () => {
    const body = JSON.stringify({ threads: [makeThread("t1", "one")], baseVersion: 3 });
    const parsed = parseCommentPushBody(body);
    expect(parsed.threads.map((thread) => thread.id)).toEqual(["t1"]);
    expect(parsed.baseVersion).toBe(3);
  });

  it("parseCommentPushBody 兼容旧版 comments 字段", () => {
    const body = JSON.stringify({
      comments: [
        { id: "c1", file: "a.txt", line: 2, body: "legacy", timestamp: "2026-01-01T00:00:00.000Z" },
      ],
    });
    const parsed = parseCommentPushBody(body);
    expect(parsed.threads).toHaveLength(1);
    expect(parsed.threads[0]?.filePath).toBe("a.txt");
  });
});

describe("comment-sessions 持久化 (issue 05)", () => {
  const createFakePersister = () => {
    let data: Record<string, CommentSessionSnapshot> = {};
    const saves: Array<Record<string, CommentSessionSnapshot>> = [];
    return {
      load: vi.fn(async (): Promise<Record<string, CommentSessionSnapshot>> => data),
      save: vi.fn(async (sessions: Record<string, CommentSessionSnapshot>): Promise<void> => {
        data = sessions;
        saves.push(sessions);
      }),
      saves,
    };
  };

  it("hydrate 恢复落盘会话 (threads + version), 幂等只 load 一次", async () => {
    const persister = createFakePersister();
    await persister.save({
      "main:feature:direct": {
        version: 4,
        updatedAt: "2026-01-01T00:00:00.000Z",
        threads: [makeThread("t1", "persisted")],
      },
    });

    const store = createCommentSessionStore(undefined, persister);
    await store.hydrate();
    await store.hydrate();

    expect(persister.load).toHaveBeenCalledTimes(1);
    const session = store.getSession(selection);
    expect(session.version).toBe(4);
    expect(session.threads.map((thread) => thread.id)).toEqual(["t1"]);
  });

  it("hydrate 不覆盖内存中已存在的会话", async () => {
    const persister = createFakePersister();
    await persister.save({
      "main:feature:direct": {
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        threads: [makeThread("t1", "persisted")],
      },
    });

    const store = createCommentSessionStore(undefined, persister);
    store.replaceThreads(selection, [makeThread("t2", "in memory")]);
    await store.hydrate();

    expect(store.getSession(selection).threads.map((thread) => thread.id)).toEqual(["t2"]);
  });

  it("replaceThreads 变化时落盘: 快照按对比键组织并携带 version", async () => {
    const persister = createFakePersister();
    const store = createCommentSessionStore(undefined, persister);
    await store.hydrate();

    const result = store.replaceThreads(selection, [makeThread("t1", "one")]);
    await result.persisted;

    expect(persister.save).toHaveBeenCalledTimes(1);
    const snapshot = persister.saves[0]?.["main:feature:direct"];
    expect(snapshot?.version).toBe(1);
    expect(typeof snapshot?.updatedAt).toBe("string");
    expect(snapshot?.threads.map((thread) => thread.id)).toEqual(["t1"]);
  });

  it("内容未变化不落盘", async () => {
    const persister = createFakePersister();
    const store = createCommentSessionStore(undefined, persister);
    await store.hydrate();

    store.replaceThreads(selection, [makeThread("t1", "one")]);
    const again = store.replaceThreads(selection, [makeThread("t1", "one")]);
    await again.persisted;

    expect(persister.save).toHaveBeenCalledTimes(1);
  });

  it("deleteThread 移除后落盘空会话; 未命中不落盘", async () => {
    const persister = createFakePersister();
    const store = createCommentSessionStore(undefined, persister);
    await store.hydrate();

    store.replaceThreads(selection, [makeThread("t1", "one")]);
    const removed = store.deleteThread(selection, "t1");
    await removed.persisted;

    const lastSave = persister.saves[persister.saves.length - 1];
    expect(lastSave?.["main:feature:direct"]?.threads).toEqual([]);

    const saveCountBefore = persister.saves.length;
    const missing = store.deleteThread(selection, "missing");
    await missing.persisted;
    expect(persister.saves).toHaveLength(saveCountBefore);
  });

  it("无 persister 时行为不变, persisted 立即解析", async () => {
    const store = createCommentSessionStore();
    await store.hydrate();

    const result = store.replaceThreads(selection, [makeThread("t1", "one")]);
    await expect(result.persisted).resolves.toBeUndefined();
    expect(result.version).toBe(1);
  });
});
