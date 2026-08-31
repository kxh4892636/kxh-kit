import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { cjkTokenize } from "./split";
import { MemoryStore } from "./store";
import type { Memory } from "./store";

const mustGet = (store: MemoryStore, id: number): Memory => {
  const memory = store.get(id);
  expect(memory).not.toBeNull();
  return memory as Memory;
};

describe("MemoryStore", () => {
  it("add 后 get 读回全字段（tags/meta 解析）", () => {
    const store = new MemoryStore(":memory:");
    const added = store.add({
      text: "记得在提交前运行 pnpm check",
      agent: "agent-a",
      run: "run-1",
      tags: ["dev", "pnpm"],
      meta: { importance: "high", nested: { ok: true } },
    });
    expect(added.duplicate).toBe(false);
    const memory = mustGet(store, added.id);
    expect(memory.text).toBe("记得在提交前运行 pnpm check");
    expect(memory.textHash).toBe(
      createHash("sha256").update("记得在提交前运行 pnpm check").digest("hex"),
    );
    expect(memory.agent).toBe("agent-a");
    expect(memory.runKey).toBe("run-1");
    expect(memory.tags).toEqual(["dev", "pnpm"]);
    expect(memory.meta).toEqual({ importance: "high", nested: { ok: true } });
    expect(memory.state).toBe("active");
    expect(memory.createdAt).toBe(memory.updatedAt);
    expect(Number.isNaN(Date.parse(memory.createdAt))).toBe(false);
    expect(memory.lastReview).toBeNull();
    expect(memory.due).toBeNull();
    expect(memory.stability).toBe(0);
    expect(memory.difficulty).toBe(0);
    expect(memory.reps).toBe(0);
    expect(memory.lapses).toBe(0);
    expect(memory.fsrsState).toBe(0);
    expect(memory.trashedAt).toBeNull();
    store.close();
  });

  it("默认值：run 省略为 '', tags [], meta {}", () => {
    const store = new MemoryStore(":memory:");
    const added = store.add({ text: "无标签记忆", agent: "agent-b" });
    const memory = mustGet(store, added.id);
    expect(memory.runKey).toBe("");
    expect(memory.tags).toEqual([]);
    expect(memory.meta).toEqual({});
    store.close();
  });

  it("去重：同 agent 同文本返回同 id 不增记录；不同 run 允许重复", () => {
    const store = new MemoryStore(":memory:");
    const first = store.add({ text: "同一个文本", agent: "agent" });
    const again = store.add({ text: "同一个文本", agent: "agent" });
    expect(again.duplicate).toBe(true);
    expect(again.id).toBe(first.id);
    expect(store.list()).toHaveLength(1);

    const anotherRun = store.add({ text: "同一个文本", agent: "agent", run: "run-2" });
    expect(anotherRun.duplicate).toBe(false);
    expect(anotherRun.id).not.toBe(first.id);
    expect(store.list()).toHaveLength(2);

    const anotherAgent = store.add({ text: "同一个文本", agent: "other" });
    expect(anotherAgent.duplicate).toBe(false);
    expect(anotherAgent.id).not.toBe(first.id);
    expect(store.list()).toHaveLength(3);
    store.close();
  });

  it("list 按 agent/run/tags/state/limit 过滤，新纪录优先", () => {
    const store = new MemoryStore(":memory:");
    expect(store.list()).toEqual([]);
    const a = store.add({ text: "t1", agent: "a1", tags: ["x"] });
    const b = store.add({ text: "t2", agent: "a2", run: "r2", tags: ["x", "y"] });
    const c = store.add({ text: "t3", agent: "a1", tags: ["y"] });
    expect(store.list().map((memory) => memory.id)).toEqual([c.id, b.id, a.id]);
    expect(store.list({ agent: "a1" }).map((memory) => memory.id)).toEqual([c.id, a.id]);
    expect(store.list({ run: "r2" }).map((memory) => memory.id)).toEqual([b.id]);
    expect(store.list({ tags: ["x"] }).map((memory) => memory.id)).toEqual([b.id, a.id]);
    expect(store.list({ tags: ["x", "y"] }).map((memory) => memory.id)).toEqual([b.id]);
    expect(store.list({ limit: 2 }).map((memory) => memory.id)).toEqual([c.id, b.id]);
    expect(store.list({ state: "active" })).toHaveLength(3);
    store.delete(a.id);
    expect(store.list({ state: "active" }).map((memory) => memory.id)).toEqual([c.id, b.id]);
    expect(store.list({ state: "trashed" }).map((memory) => memory.id)).toEqual([a.id]);
    expect(store.list({ state: ["active", "trashed"] })).toHaveLength(3);
    store.close();
  });

  it("delete 软删除：state=trashed + trashed_at，get 仍可读，FTS 不再命中", () => {
    const store = new MemoryStore(":memory:");
    const added = store.add({ text: "记忆信息很关键", agent: "agent" });
    const before = mustGet(store, added.id);
    expect(store.delete(added.id)).toBe(true);
    const after = mustGet(store, added.id);
    expect(after.state).toBe("trashed");
    if (after.trashedAt === null) throw new Error("trashedAt should be set after delete");
    expect(Number.isNaN(Date.parse(after.trashedAt))).toBe(false);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
    expect(store.searchFts(cjkTokenize("记忆"))).toEqual([]);
    expect(store.searchFts(cjkTokenize("信息关键"))).toEqual([]);
    expect(store.delete(added.id)).toBe(true);
    expect(store.delete(999999)).toBe(false);
    store.close();
  });

  it("setState 在 active/trashed 间转移并同步 FTS", () => {
    const store = new MemoryStore(":memory:");
    const added = store.add({ text: "记忆信息很关键", agent: "agent" });
    expect(store.searchFts(cjkTokenize("记忆")).map((hit) => hit.id)).toEqual([added.id]);

    const trashed = store.setState(added.id, "trashed");
    expect(trashed?.state).toBe("trashed");
    expect(trashed?.trashedAt).not.toBeNull();
    expect(store.searchFts(cjkTokenize("记忆"))).toEqual([]);

    const restored = store.setState(added.id, "active");
    expect(restored?.state).toBe("active");
    expect(restored?.trashedAt).toBeNull();
    expect(store.searchFts(cjkTokenize("记忆")).map((hit) => hit.id)).toEqual([added.id]);

    expect(store.setState(added.id, "active")?.state).toBe("active");
    expect(store.setState(999999, "trashed")).toBeNull();
    store.close();
  });

  it("touch 刷新 updated_at", () => {
    const store = new MemoryStore(":memory:");
    const added = store.add({ text: "x", agent: "a" });
    const before = mustGet(store, added.id);
    const touched = store.touch(added.id);
    expect(touched).not.toBeNull();
    if (touched === null) throw new Error("touch should return the memory");
    expect(touched.updatedAt >= before.updatedAt).toBe(true);
    expect(store.touch(999999)).toBeNull();
    store.close();
  });

  it("tags/meta 解析：损坏 JSON 回退默认值", () => {
    const db = new DatabaseSync(":memory:");
    const store = new MemoryStore(db);
    const defaults = store.add({ text: "x", agent: "a" });
    expect(mustGet(store, defaults.id).tags).toEqual([]);
    expect(mustGet(store, defaults.id).meta).toEqual({});

    db.prepare("UPDATE memories SET tags = ?, meta = ? WHERE id = ?").run(
      "{bad",
      "[1,2]",
      defaults.id,
    );
    const corrupt = mustGet(store, defaults.id);
    expect(corrupt.tags).toEqual([]);
    expect(corrupt.meta).toEqual({});

    const mixed = store.add({ text: "y", agent: "a" });
    db.prepare("UPDATE memories SET tags = ?, meta = ? WHERE id = ?").run(
      '[1,"ok"]',
      '"str"',
      mixed.id,
    );
    const mixedRow = mustGet(store, mixed.id);
    expect(mixedRow.tags).toEqual(["ok"]);
    expect(mixedRow.meta).toEqual({});

    // 外部传入的实例不由 store 关闭
    store.close();
    expect(() => db.prepare("SELECT 1").get()).not.toThrow();
  });

  it("FTS5 中文命中：「记忆」与「信息关键」均命中且 bm25 可取分", () => {
    const store = new MemoryStore(":memory:");
    const added = store.add({ text: "记忆信息很关键", agent: "agent" });
    const byWord = store.searchFts(cjkTokenize("记忆"));
    expect(byWord.map((hit) => hit.id)).toEqual([added.id]);
    for (const hit of byWord) {
      expect(typeof hit.bm25).toBe("number");
      expect(Number.isFinite(hit.bm25)).toBe(true);
      expect(hit.bm25).toBeLessThan(0);
    }
    const byPhrase = store.searchFts(cjkTokenize("信息关键"));
    expect(byPhrase.map((hit) => hit.id)).toEqual([added.id]);
    for (const hit of byPhrase) {
      expect(Number.isFinite(hit.bm25)).toBe(true);
    }
    expect(store.searchFts(cjkTokenize("不存在的词"))).toEqual([]);
    store.close();
  });

  it("文件 DB 持久化：重开可读回记录与 FTS", () => {
    const dir = mkdtempSync(join(tmpdir(), "nano-mem-"));
    const dbPath = join(dir, "mem.db");
    try {
      const first = new MemoryStore(dbPath);
      const added = first.add({
        text: "记忆信息很关键",
        agent: "agent",
        tags: ["t"],
        meta: { k: 1 },
      });
      first.close();

      const second = new MemoryStore(dbPath);
      expect(second.get(added.id)?.text).toBe("记忆信息很关键");
      expect(second.searchFts(cjkTokenize("记忆")).map((hit) => hit.id)).toEqual([added.id]);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("schema：memories 与 memories_fts 存在，UNIQUE 约束生效", () => {
    const db = new DatabaseSync(":memory:");
    const store = new MemoryStore(db);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'memories'").get()?.["name"],
    ).toBe("memories");
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'memories_fts'").get()?.["name"],
    ).toBe("memories_fts");

    const insert = db.prepare(
      `INSERT INTO memories (text, text_hash, agent, run_key, tags, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run("t", "h", "a", "", "[]", "{}", "now", "now");
    expect(() => insert.run("t", "h", "a", "", "[]", "{}", "now", "now")).toThrow(/UNIQUE/);
    store.close();
  });
});
