import { describe, it, expect } from "vitest";

import type { DiffCommentThread, DiffSelection } from "../types/diff.js";

import { createCommentSessionStore, parseCommentPushBody } from "./comment-sessions.js";

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
