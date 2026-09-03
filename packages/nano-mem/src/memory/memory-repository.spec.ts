import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";
import {
  createMemoryRepository,
  MemoryScope,
  type MemoryRecord,
  type MemoryRepository,
} from "./memory-repository.js";
import { migrateMemoryDatabase } from "./memory-schema.js";
import { INITIAL_DIFFICULTY, INITIAL_STABILITY_DAYS } from "./retention-state.js";

interface RepositoryFixture {
  advance: (milliseconds: number) => void;
  database: DatabaseSync;
  repository: MemoryRepository;
}

const openDatabases: DatabaseSync[] = [];

const createFixture = (): RepositoryFixture => {
  const database = new DatabaseSync(":memory:");
  openDatabases.push(database);
  migrateMemoryDatabase(database);
  let currentTime = 1_700_000_000_000;
  let sequence = 0;
  return {
    advance: (milliseconds: number): void => {
      currentTime += milliseconds;
    },
    database,
    repository: createMemoryRepository({
      createId: (): string => `memory-${(sequence += 1)}`,
      database,
      now: (): Date => new Date(currentTime),
    }),
  };
};

afterEach((): void => {
  for (const database of openDatabases.splice(0)) database.close();
});

describe("memory repository scope and identity", (): void => {
  test("isolates project memories while sharing global memories", (): void => {
    const { repository } = createFixture();
    repository.add({ content: "project one", projectId: "one", scope: MemoryScope.project });
    repository.add({ content: "project two", projectId: "two", scope: MemoryScope.project });
    repository.add({ content: "shared", projectId: "ignored", scope: MemoryScope.global });
    expect(
      repository
        .list({ projectId: "one", scope: "all" })
        .map((memory: MemoryRecord): string => memory.content),
    ).toEqual(["project one", "shared"]);
    expect(
      repository
        .list({ projectId: "two", scope: MemoryScope.project })
        .map((memory: MemoryRecord): string => memory.content),
    ).toEqual(["project two"]);
    expect(repository.list({ projectId: "one", scope: MemoryScope.global })[0]?.projectId).toBe("");
  });

  test("deduplicates NFKC and whitespace identities but preserves case and scope", (): void => {
    const { repository } = createFixture();
    const first = repository.add({
      content: "Ａ  useful\n memory",
      projectId: "one",
      scope: MemoryScope.project,
    });
    const duplicate = repository.add({
      content: "A useful memory",
      projectId: "one",
      scope: MemoryScope.project,
    });
    const differentCase = repository.add({
      content: "a useful memory",
      projectId: "one",
      scope: MemoryScope.project,
    });
    const global = repository.add({
      content: "A useful memory",
      projectId: "one",
      scope: MemoryScope.global,
    });
    expect(duplicate).toMatchObject({ created: false, memory: { id: first.memory.id } });
    expect(differentCase.memory.id).not.toBe(first.memory.id);
    expect(global.memory.id).not.toBe(first.memory.id);
  });
});

describe("memory repository lifecycle-preserving updates", (): void => {
  test("content updates preserve identity timestamps and reset lifecycle state", (): void => {
    const fixture = createFixture();
    const added = fixture.repository.add({
      content: "before",
      projectId: "one",
      scope: MemoryScope.project,
      source: "note",
    }).memory;
    fixture.database.exec(
      `UPDATE memories SET stability = 99, difficulty = 8, use_count = 4,
       retrieval_count = 7, last_used_at_ms = 123, explicit_forgotten_at_ms = 456
       WHERE id = '${added.id}'`,
    );
    fixture.advance(60_000);
    const updated = fixture.repository.update({
      content: "after",
      id: added.id,
      selector: { projectId: "one", scope: "all" },
      sourceSpecified: false,
    });
    expect(updated).toMatchObject({
      content: "after",
      createdAtMs: added.createdAtMs,
      difficulty: INITIAL_DIFFICULTY,
      explicitForgottenAtMs: null,
      id: added.id,
      lastUsedAtMs: null,
      retrievalCount: 0,
      stability: INITIAL_STABILITY_DAYS,
      useCount: 0,
    });
    expect(updated.updatedAtMs).toBe(added.updatedAtMs + 60_000);
  });

  test("source-only updates preserve lifecycle fields", (): void => {
    const fixture = createFixture();
    const added = fixture.repository.add({
      content: "content",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    fixture.database
      .prepare("UPDATE memories SET stability = 42, use_count = 3 WHERE id = ?")
      .run(added.id);
    fixture.advance(1_000);
    const updated = fixture.repository.update({
      id: added.id,
      selector: { projectId: "one", scope: "all" },
      source: "new source",
      sourceSpecified: true,
    });
    expect(updated).toMatchObject({
      content: "content",
      source: "new source",
      stability: 42,
      useCount: 3,
    });
    expect(updated.retentionAnchorAtMs).toBe(added.retentionAnchorAtMs);
  });
});

describe("memory repository explicit maintenance", (): void => {
  test("refuses identity collisions during update", (): void => {
    const { repository } = createFixture();
    const first = repository.add({
      content: "first",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    repository.add({ content: "second", projectId: "one", scope: MemoryScope.project });
    expect((): void => {
      repository.update({
        content: "second",
        id: first.id,
        selector: { projectId: "one", scope: "all" },
        sourceSpecified: false,
      });
    }).toThrowError(expect.objectContaining({ code: "MEMORY_IDENTITY_CONFLICT" }));
  });

  test("requires force before permanent deletion", (): void => {
    const { repository } = createFixture();
    const added = repository.add({
      content: "delete me",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    expect((): void => {
      repository.delete(added.id, { projectId: "one", scope: "all" }, false);
    }).toThrowError(expect.objectContaining({ code: "DELETE_REQUIRES_FORCE" }));
    expect(repository.get(added.id, { projectId: "one", scope: "all" }).id).toBe(added.id);
    expect(repository.delete(added.id, { projectId: "one", scope: "all" }, true).id).toBe(added.id);
    expect((): void => {
      repository.get(added.id, { projectId: "one", scope: "all" });
    }).toThrowError(expect.objectContaining({ code: "MEMORY_NOT_FOUND" }));
  });
});

describe("memory repository transactionally synchronized FTS", (): void => {
  test("keeps the external-content FTS index synchronized", (): void => {
    const fixture = createFixture();
    const added = fixture.repository.add({
      content: "alpha memory",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    expect(
      fixture.database
        .prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'alpha'")
        .all(),
    ).toHaveLength(1);
    fixture.repository.update({
      content: "beta memory",
      id: added.id,
      selector: { projectId: "one", scope: "all" },
      sourceSpecified: false,
    });
    expect(
      fixture.database
        .prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'alpha'")
        .all(),
    ).toHaveLength(0);
    expect(
      fixture.database
        .prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'beta'")
        .all(),
    ).toHaveLength(1);
    fixture.repository.delete(added.id, { projectId: "one", scope: "all" }, true);
    expect(
      fixture.database
        .prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'beta'")
        .all(),
    ).toHaveLength(0);
  });

  test("rolls back memory and FTS writes when a trigger fails", (): void => {
    const fixture = createFixture();
    fixture.database.exec(
      "CREATE TRIGGER reject_memory AFTER INSERT ON memories BEGIN SELECT RAISE(ABORT, 'rejected'); END;",
    );
    expect((): void => {
      fixture.repository.add({
        content: "will roll back",
        projectId: "one",
        scope: MemoryScope.project,
      });
    }).toThrow();
    expect(fixture.repository.list({ projectId: "one", scope: "all" })).toEqual([]);
    expect(fixture.database.prepare("SELECT rowid FROM memories_fts").all()).toEqual([]);
  });
});

describe("memory repository full-text search", (): void => {
  test("finds Chinese, English, identifier, file, path, and extension terms", (): void => {
    const { repository } = createFixture();
    const chinese = repository.add({
      content: "使用缓存策略降低重复读取",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    const code = repository.add({
      content: "src/services/getUserProfile reads user_cache from nano-mem.test.ts",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    for (const query of ["缓存", "重复读取"]) {
      expect(
        repository.search({ limit: 10, query, selector: { projectId: "one", scope: "all" } })[0]
          ?.id,
      ).toBe(chinese.id);
    }
    for (const query of ["services", "getUserProfile", "user", "cache", "nano-mem", "test.ts"]) {
      expect(
        repository.search({ limit: 10, query, selector: { projectId: "one", scope: "all" } })[0]
          ?.id,
      ).toBe(code.id);
    }
  });

  test("treats FTS syntax as text and keeps candidates inside the selected scope", (): void => {
    const { repository } = createFixture();
    const current = repository.add({
      content: "title operator memory",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    const global = repository.add({
      content: "title shared memory",
      projectId: "ignored",
      scope: MemoryScope.global,
    }).memory;
    repository.add({
      content: "title secret memory",
      projectId: "two",
      scope: MemoryScope.project,
    });
    const literalSyntax = repository.search({
      limit: 10,
      query: 'title OR "memory" -drop:(); DROP TABLE memories;',
      selector: { projectId: "one", scope: "all" },
    });
    expect(literalSyntax.map((memory: MemoryRecord): string => memory.id)).toEqual(
      expect.arrayContaining([current.id, global.id]),
    );
    expect(literalSyntax).toHaveLength(2);
    const results = repository.search({
      limit: 10,
      query: "title memory",
      selector: { projectId: "one", scope: "all" },
    });
    expect(results.map((memory: MemoryRecord): string => memory.id)).toEqual(
      expect.arrayContaining([current.id, global.id]),
    );
    expect(results).toHaveLength(2);
  });

  test("keeps stronger BM25 relevance ahead before lifecycle signals differ", (): void => {
    const { repository } = createFixture();
    const exact = repository.add({
      content: "precise",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    repository.add({
      content: "precise with several unrelated filler words around the candidate",
      projectId: "one",
      scope: MemoryScope.project,
    });
    const results = repository.search({
      limit: 2,
      query: "precise",
      selector: { projectId: "one", scope: "all" },
    });
    expect(results[0]?.id).toBe(exact.id);
  });

  test("fills results from complete word-match tiers before lower tiers", (): void => {
    const fixture = createFixture();
    const memories = [
      "pi subagent domain glossary adr",
      "pi subagent domain glossary",
      "pi subagent domain",
      "pi subagent",
      "pi",
    ].map(
      (content: string): MemoryRecord =>
        fixture.repository.add({ content, projectId: "one", scope: MemoryScope.project }).memory,
    );
    const results = fixture.repository.search({
      limit: 4,
      query: "Pi subagent domain glossary ADR",
      selector: { projectId: "one", scope: "all" },
    });
    expect(results.map((memory: MemoryRecord): string => memory.id)).toEqual(
      memories.slice(0, 4).map((memory: MemoryRecord): string => memory.id),
    );
    expect(
      fixture.repository.get(memories[4]!.id, { projectId: "one", scope: "all" }),
    ).toMatchObject({ retrievalCount: 0 });
  });
  test("deduplicates groups and rejects partial CJK group matches", (): void => {
    const fixture = createFixture();
    const both = fixture.repository.add({
      content: "pi subagent",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    const piOnly = fixture.repository.add({
      content: "pi",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    const cjk = fixture.repository.add({
      content: "缓存命中",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    fixture.repository.add({ content: "缓慢", projectId: "one", scope: MemoryScope.project });
    expect(
      fixture.repository
        .search({
          limit: 2,
          query: "pi pi subagent",
          selector: { projectId: "one", scope: "all" },
        })
        .map((memory: MemoryRecord): string => memory.id),
    ).toEqual([both.id, piOnly.id]);
    expect(
      fixture.repository
        .search({
          limit: 10,
          query: "缓存 absent",
          selector: { projectId: "one", scope: "all" },
        })
        .map((memory: MemoryRecord): string => memory.id),
    ).toEqual([cjk.id]);
  });

  test("ranks the complete single-word tier without a fifty-candidate pre-limit", (): void => {
    const fixture = createFixture();
    const candidates = Array.from(
      { length: 51 },
      (_value: unknown, index: number): MemoryRecord =>
        fixture.repository.add({
          content: `needle candidate ${String(index + 1).padStart(3, "0")}`,
          projectId: "one",
          scope: MemoryScope.project,
        }).memory,
    );
    const lastId = candidates
      .map((memory: MemoryRecord): string => memory.id)
      .sort()
      .at(-1)!;
    fixture.database
      .prepare("UPDATE memories SET use_count = 100, retrieval_count = 100 WHERE id = ?")
      .run(lastId);
    expect(
      fixture.repository.search({
        limit: 1,
        query: "needle",
        selector: { projectId: "one", scope: "all" },
      })[0]?.id,
    ).toBe(lastId);
  });
});

describe("memory repository retrieval accounting", (): void => {
  test("enforces the public search limit invariant", (): void => {
    const { repository } = createFixture();
    expect((): void => {
      repository.search({
        limit: 51,
        query: "anything",
        selector: { projectId: "one", scope: "all" },
      });
    }).toThrowError(expect.objectContaining({ code: "INVALID_LIMIT" }));
  });

  test("increments only returned results and leaves empty searches unchanged", (): void => {
    const fixture = createFixture();
    for (const suffix of ["a", "b", "c"]) {
      fixture.repository.add({
        content: `bounded candidate ${suffix}`,
        projectId: "one",
        scope: MemoryScope.project,
      });
    }
    expect(
      fixture.repository.search({
        limit: 2,
        query: "bounded candidate",
        selector: { projectId: "one", scope: "all" },
      }),
    ).toHaveLength(2);
    const counts = fixture.database
      .prepare("SELECT retrieval_count FROM memories ORDER BY id")
      .all() as Array<{ retrieval_count: number }>;
    expect(
      counts
        .map((row: { retrieval_count: number }): number => row.retrieval_count)
        .sort((left: number, right: number): number => left - right),
    ).toEqual([0, 1, 1]);
    expect(
      fixture.repository.search({
        limit: 10,
        query: "missing",
        selector: { projectId: "one", scope: "all" },
      }),
    ).toEqual([]);
    expect(fixture.repository.list({ projectId: "one", scope: "all" })).toHaveLength(3);
  });

  test("rolls back all retrieval counts when incrementing a result fails", (): void => {
    const fixture = createFixture();
    fixture.repository.add({
      content: "atomic result one",
      projectId: "one",
      scope: MemoryScope.project,
    });
    fixture.repository.add({
      content: "atomic result two",
      projectId: "one",
      scope: MemoryScope.project,
    });
    fixture.database.exec(
      "CREATE TRIGGER reject_retrieval BEFORE UPDATE OF retrieval_count ON memories BEGIN SELECT RAISE(ABORT, 'rejected'); END;",
    );
    expect((): void => {
      fixture.repository.search({
        limit: 2,
        query: "atomic result",
        selector: { projectId: "one", scope: "all" },
      });
    }).toThrow();
    expect(
      fixture.database.prepare("SELECT sum(retrieval_count) AS total FROM memories").get(),
    ).toEqual({ total: 0 });
  });
});

describe("memory repository use and ranking", (): void => {
  test("repeated Good uses increase stability, forget time, and rank", (): void => {
    const fixture = createFixture();
    const lessUsed = fixture.repository.add({
      content: "shared ranking alpha",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    const moreUsed = fixture.repository.add({
      content: "shared ranking beta",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    fixture.advance(10 * 86_400_000);
    fixture.repository.use(lessUsed.id, { projectId: "one", scope: MemoryScope.project });
    fixture.repository.use(moreUsed.id, { projectId: "one", scope: MemoryScope.project });
    fixture.advance(10 * 86_400_000);
    fixture.repository.use(moreUsed.id, { projectId: "one", scope: MemoryScope.project });
    const lessUsedAfter = fixture.repository.get(lessUsed.id, { projectId: "one", scope: "all" });
    const moreUsedAfter = fixture.repository.get(moreUsed.id, { projectId: "one", scope: "all" });
    const ranked = fixture.repository.search({
      limit: 2,
      query: "shared ranking",
      selector: { projectId: "one", scope: "all" },
    });
    expect(moreUsedAfter.stability).toBeGreaterThanOrEqual(lessUsedAfter.stability);
    expect(moreUsedAfter.naturalForgetAtMs).toBeGreaterThan(lessUsedAfter.naturalForgetAtMs);
    expect(ranked[0]?.id).toBe(moreUsed.id);
  });

  test("search heats results without changing FSRS lifecycle state", (): void => {
    const fixture = createFixture();
    const added = fixture.repository.add({
      content: "retrieval-only signal",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    fixture.advance(5 * 86_400_000);
    fixture.repository.search({
      limit: 10,
      query: "retrieval signal",
      selector: { projectId: "one", scope: "all" },
    });
    const retrieved = fixture.repository.get(added.id, { projectId: "one", scope: "all" });
    expect(retrieved).toMatchObject({
      lastUsedAtMs: added.lastUsedAtMs,
      naturalForgetAtMs: added.naturalForgetAtMs,
      retrievalCount: 1,
      stability: added.stability,
      useCount: 0,
    });
  });
});

describe("memory repository soft forgetting", (): void => {
  test("hides naturally and explicitly forgotten memories from search", (): void => {
    const fixture = createFixture();
    const natural = fixture.repository.add({
      content: "forgotten natural candidate",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    const explicit = fixture.repository.add({
      content: "forgotten explicit candidate",
      projectId: "one",
      scope: MemoryScope.project,
    }).memory;
    fixture.repository.forget(explicit.id, { projectId: "one", scope: MemoryScope.project });
    fixture.advance(natural.naturalForgetAtMs - natural.retentionAnchorAtMs);
    expect(
      fixture.repository.search({
        limit: 10,
        query: "forgotten candidate",
        selector: { projectId: "one", scope: "all" },
      }),
    ).toEqual([]);
    expect(fixture.repository.get(natural.id, { projectId: "one", scope: "all" }).id).toBe(
      natural.id,
    );
    expect(fixture.repository.list({ projectId: "one", scope: "all" })).toHaveLength(2);
  });

  test("rejects use until restore resets lifecycle and preserves identity", (): void => {
    const fixture = createFixture();
    const added = fixture.repository.add({
      content: "restore identity",
      projectId: "one",
      scope: MemoryScope.project,
      source: "source",
    }).memory;
    fixture.database
      .prepare(
        "UPDATE memories SET stability = 90, use_count = 9, retrieval_count = 8 WHERE id = ?",
      )
      .run(added.id);
    fixture.repository.forget(added.id, { projectId: "one", scope: MemoryScope.project });
    expect((): void => {
      fixture.repository.use(added.id, { projectId: "one", scope: MemoryScope.project });
    }).toThrowError(expect.objectContaining({ code: "MEMORY_FORGOTTEN" }));
    fixture.advance(1_000);
    const restored = fixture.repository.restore(added.id, {
      projectId: "one",
      scope: MemoryScope.project,
    });
    expect(restored).toMatchObject({
      content: added.content,
      createdAtMs: added.createdAtMs,
      explicitForgottenAtMs: null,
      id: added.id,
      lastUsedAtMs: null,
      retrievalCount: 0,
      source: "source",
      stability: INITIAL_STABILITY_DAYS,
      useCount: 0,
    });
    expect((): void => {
      fixture.repository.restore(added.id, { projectId: "one", scope: MemoryScope.project });
    }).toThrowError(expect.objectContaining({ code: "MEMORY_NOT_FORGOTTEN" }));
  });
});
