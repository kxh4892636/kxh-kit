import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DiffCommentThread } from "../types/diff.js";

import { createCommentPersister, type CommentSessionSnapshot } from "./comment-persistence.js";

const SELECTION_KEY = "HEAD:.:direct";

const makeThread = (id: string, body: string): DiffCommentThread => ({
  id,
  filePath: "src/a.ts",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  position: { side: "new", line: 2 },
  codeSnapshot: { content: "const x = 1;", language: "typescript" },
  messages: [
    {
      id,
      body,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
});

const makeSnapshot = (threads: DiffCommentThread[], version = 1): CommentSessionSnapshot => ({
  version,
  updatedAt: "2026-01-01T00:00:00.000Z",
  threads,
});

describe("comment-persistence", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "diff-viewer-comments-"));
    filePath = join(dir, "repo-a.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("文件缺失时 load 回退空集合", async () => {
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });
    await expect(persister.load()).resolves.toEqual({});
  });

  it("save → load 往返: 会话按对比键组织, 锚点字段完整保留", async () => {
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });
    const thread = makeThread("t1", "hello");
    // old side + 行范围锚点
    const oldSideThread: DiffCommentThread = {
      ...makeThread("t2", "old side"),
      position: { side: "old", line: { start: 3, end: 5 } },
      codeSnapshot: undefined,
    };
    await persister.save({
      [SELECTION_KEY]: makeSnapshot([thread, oldSideThread], 4),
      "main:feature:merge-base": makeSnapshot([makeThread("t3", "other selection")], 2),
    });

    const loaded = await persister.load();
    expect(Object.keys(loaded).sort()).toEqual([SELECTION_KEY, "main:feature:merge-base"].sort());

    const restored = loaded[SELECTION_KEY];
    expect(restored?.version).toBe(4);
    expect(restored?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(restored?.threads).toHaveLength(2);

    const first = restored?.threads[0];
    expect(first?.filePath).toBe("src/a.ts");
    expect(first?.position).toEqual({ side: "new", line: 2 });
    expect(first?.codeSnapshot).toEqual({ content: "const x = 1;", language: "typescript" });
    expect(first?.messages[0]?.body).toBe("hello");

    const second = restored?.threads[1];
    expect(second?.position).toEqual({ side: "old", line: { start: 3, end: 5 } });
    expect(second?.codeSnapshot).toBeUndefined();
  });

  it("落盘 JSON 记录仓库路径与格式版本, 供人排查", async () => {
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });
    await persister.save({ [SELECTION_KEY]: makeSnapshot([makeThread("t1", "hi")]) });

    const raw = JSON.parse(await readFile(filePath, "utf-8")) as {
      version: number;
      repoPath: string;
      sessions: Record<string, unknown>;
    };
    expect(raw.version).toBe(1);
    expect(raw.repoPath).toBe("/repo/a");
    expect(Object.keys(raw.sessions)).toEqual([SELECTION_KEY]);
  });

  it("原子写: 完成后目录无临时文件残留", async () => {
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });
    await persister.save({ [SELECTION_KEY]: makeSnapshot([makeThread("t1", "hi")]) });

    const entries = await readdir(dir);
    expect(entries).toEqual(["repo-a.json"]);
  });

  it("连续 save 串行落盘, 最终内容为最后一次快照", async () => {
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });
    await Promise.all([
      persister.save({ [SELECTION_KEY]: makeSnapshot([makeThread("t1", "first")], 1) }),
      persister.save({ [SELECTION_KEY]: makeSnapshot([makeThread("t2", "second")], 2) }),
    ]);

    const loaded = await persister.load();
    expect(loaded[SELECTION_KEY]?.threads.map((thread) => thread.id)).toEqual(["t2"]);
  });

  it("损坏文件: load 回退空集合, 原文件隔离留证", async () => {
    await writeFile(filePath, "{ not json", "utf-8");
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });

    await expect(persister.load()).resolves.toEqual({});

    const entries = await readdir(dir);
    expect(entries.filter((entry) => entry.startsWith("repo-a.json.corrupt-"))).toHaveLength(1);
    expect(entries).not.toContain("repo-a.json");
  });

  it("形状非法 (版本/结构不符) 同样回退空集合并隔离", async () => {
    await writeFile(filePath, JSON.stringify({ version: 2, sessions: {} }), "utf-8");
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });

    await expect(persister.load()).resolves.toEqual({});
    const entries = await readdir(dir);
    expect(entries.filter((entry) => entry.startsWith("repo-a.json.corrupt-"))).toHaveLength(1);
  });

  it("形状非法的会话条目被丢弃, 合法条目保留", async () => {
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        repoPath: "/repo/a",
        sessions: {
          [SELECTION_KEY]: makeSnapshot([makeThread("t1", "valid")]),
          broken: { version: "x" },
        },
      }),
      "utf-8",
    );
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });

    const loaded = await persister.load();
    expect(Object.keys(loaded)).toEqual([SELECTION_KEY]);
  });

  it("同目录不同仓库的 persister 各写各的文件, 互不干扰", async () => {
    const otherPath = join(dir, "repo-b.json");
    const a = createCommentPersister({ filePath, repoPath: "/repo/a" });
    const b = createCommentPersister({ filePath: otherPath, repoPath: "/repo/b" });

    await a.save({ [SELECTION_KEY]: makeSnapshot([makeThread("t1", "in a")]) });
    await b.save({ [SELECTION_KEY]: makeSnapshot([makeThread("t2", "in b")]) });

    expect(Object.keys(await a.load())).toEqual([SELECTION_KEY]);
    expect((await a.load())[SELECTION_KEY]?.threads[0]?.id).toBe("t1");
    expect((await b.load())[SELECTION_KEY]?.threads[0]?.id).toBe("t2");
  });

  it("load 后 save 不丢既有会话之外的数据 (整文件读写)", async () => {
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });
    await persister.save({
      one: makeSnapshot([makeThread("t1", "one")]),
      two: makeSnapshot([makeThread("t2", "two")]),
    });

    const loaded = await persister.load();
    await persister.save({ ...loaded, three: makeSnapshot([makeThread("t3", "three")]) });

    const reloaded = await persister.load();
    expect(Object.keys(reloaded).sort()).toEqual(["one", "three", "two"]);
  });

  it("rename 目标跨平台: 已有文件时覆盖而非报错", async () => {
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });
    await persister.save({ [SELECTION_KEY]: makeSnapshot([makeThread("t1", "first")]) });
    await persister.save({ [SELECTION_KEY]: makeSnapshot([makeThread("t2", "second")]) });

    expect((await persister.load())[SELECTION_KEY]?.threads[0]?.id).toBe("t2");
  });

  it("损坏隔离: 原文件内容保留在隔离副本中", async () => {
    await writeFile(filePath, "{ not json", "utf-8");
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });
    await persister.load();

    const entries = await readdir(dir);
    const quarantined = entries.find((entry) => entry.startsWith("repo-a.json.corrupt-"));
    expect(quarantined).toBeDefined();
    await expect(readFile(join(dir, quarantined!), "utf-8")).resolves.toBe("{ not json");
  });

  it("load 对sessions 内非对象条目健壮 (null/数组)", async () => {
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        repoPath: "/repo/a",
        sessions: { bad1: null, bad2: [1, 2], good: makeSnapshot([makeThread("t1", "ok")]) },
      }),
      "utf-8",
    );
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });

    const loaded = await persister.load();
    expect(Object.keys(loaded)).toEqual(["good"]);
  });

  it("隔离损坏文件后再次 load 仍为空集合 (幂等)", async () => {
    await writeFile(filePath, "garbage", "utf-8");
    const persister = createCommentPersister({ filePath, repoPath: "/repo/a" });
    await persister.load();
    await expect(persister.load()).resolves.toEqual({});
  });
});
