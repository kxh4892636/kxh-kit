import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { helpText, nodeEnv, resolveDbPath, runCli, type CliEnv, type CliResult } from "./cli";
import type { Memory, MemoryState } from "./store";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

interface AddJson {
  readonly id: number;
}
interface MemoryJson {
  readonly memory: Memory;
}
interface ListJson {
  readonly memories: Memory[];
}
interface StatsJson {
  readonly total: number;
  readonly byState: Readonly<Record<MemoryState, number>>;
  readonly fsrs: {
    readonly averageStability: number;
    readonly averageDifficulty: number;
    readonly totalReps: number;
    readonly totalLapses: number;
    readonly averageRetrievability: number;
  };
}
interface PlanJson {
  readonly dryRun: true;
  readonly operations: ReadonlyArray<Record<string, unknown>>;
}
interface ErrorJson {
  readonly error: {
    readonly code: "usage" | "runtime";
    readonly message: string;
    readonly hint?: string;
  };
}
interface SearchJson {
  readonly results: ReadonlyArray<{
    readonly id: number;
    readonly text: string;
    readonly state: string;
    readonly score: number;
    readonly relevance: number;
    readonly strength: number;
  }>;
}
interface GcJson {
  readonly dryRun: boolean;
  readonly report: {
    readonly scanned: number;
    readonly toTrash: number[];
    readonly toPurge: number[];
  };
}

const makeEnv = (overrides: Partial<CliEnv> = {}): CliEnv => ({
  cwd: "C:/work/my-agent",
  env: {},
  homeDir: "C:/fake-home",
  now: () => NOW,
  readStdin: async () => "来自 stdin 的多行记忆\n第二行\n",
  version: "9.9.9-test",
  ...overrides,
});

const run = (argv: readonly string[], overrides: Partial<CliEnv> = {}): Promise<CliResult> =>
  runCli(argv, makeEnv(overrides));

const parseJson = <T>(text: string): T => JSON.parse(text) as T;

const mustMemory = (result: CliResult): Memory => {
  expect(result.exitCode).toBe(0);
  const memory = parseJson<MemoryJson>(result.stdout).memory;
  expect(memory).not.toBeUndefined();
  return memory;
};

/** 每个用例独立临时 db；cli 每次调用重新打开，文件 db 保证跨调用一致。 */
const withTempDb = async <T>(fn: (dbPath: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "nano-mem-cli-"));
  try {
    return await fn(join(dir, "mem.db"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const addJson = (db: string, text: string, extraArgs: readonly string[] = []): Promise<CliResult> =>
  run(["add", text, "--db", db, "--json", ...extraArgs]);

describe("全局选项（--help/--version/--db/--agent/--run/--json）", () => {
  it("--version 输出包版本，退出码 0", async () => {
    const result = await run(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("9.9.9-test\n");
    expect(result.stderr).toBe("");
  });

  it("--help 输出帮助与命令/选项/退出码说明", async () => {
    const result = await run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(helpText("9.9.9-test"));
    for (const keyword of [
      "用法:",
      "add <text>",
      "stats",
      "--json",
      "--dry-run",
      "退出码: 0 成功 / 1 运行时错误 / 2 用法错误",
    ]) {
      expect(result.stdout).toContain(keyword);
    }
  });

  it("resolveDbPath：--db 参数 > NANO_MEM_DB > ~/.nano-mem/mem.db", () => {
    const env = { NANO_MEM_DB: "C:/env/db.sqlite" };
    expect(resolveDbPath({ argvPath: "C:/arg/db.sqlite", env, homeDir: "C:/home" })).toBe(
      "C:/arg/db.sqlite",
    );
    expect(resolveDbPath({ argvPath: undefined, env, homeDir: "C:/home" })).toBe(
      "C:/env/db.sqlite",
    );
    expect(
      resolveDbPath({ argvPath: undefined, env: { NANO_MEM_DB: "" }, homeDir: "C:/home" }),
    ).toBe(join("C:/home", ".nano-mem", "mem.db"));
    expect(resolveDbPath({ argvPath: undefined, env: {}, homeDir: "C:/home" })).toBe(
      join("C:/home", ".nano-mem", "mem.db"),
    );
  });

  it("NANO_MEM_DB 指向自定义路径时数据写入该路径", async () => {
    await withTempDb(async (db) => {
      const env = makeEnv({ env: { NANO_MEM_DB: db } });
      const added = await runCli(["add", "env 库记忆", "--json"], env);
      expect(added.exitCode).toBe(0);
      expect(existsSync(db)).toBe(true);
      const got = await runCli(["get", "1", "--json"], env);
      expect(mustMemory(got).text).toBe("env 库记忆");
    });
  });

  it("--db 覆盖 NANO_MEM_DB", async () => {
    await withTempDb(async (db) => {
      const other = `${db}.other`;
      const env = makeEnv({ env: { NANO_MEM_DB: other } });
      const added = await runCli(["add", "arg db 记忆", "--db", db, "--json"], env);
      expect(added.exitCode).toBe(0);
      expect(existsSync(db)).toBe(true);
      expect(existsSync(other)).toBe(false);
      const got = await runCli(["get", "1", "--db", db, "--json"], env);
      expect(mustMemory(got).text).toBe("arg db 记忆");
    });
  });

  it("--agent 默认 cwd basename；--run 默认 ''", async () => {
    await withTempDb(async (db) => {
      await addJson(db, "默认 agent 记忆");
      const memory = mustMemory(await run(["get", "1", "--db", db, "--json"]));
      expect(memory.agent).toBe("my-agent");
      expect(memory.runKey).toBe("");
      await addJson(db, "带 run 的记忆", ["--run", "run-1"]);
      expect(mustMemory(await run(["get", "2", "--db", db, "--json"])).runKey).toBe("run-1");
    });
  });

  it("nodeEnv 提供真实进程环境（版本读 package.json）", () => {
    const env = nodeEnv();
    expect(env.version).toBe("0.1.0");
    expect(typeof env.cwd).toBe("string");
    expect(env.now()).toBeInstanceOf(Date);
    expect(typeof env.readStdin).toBe("function");
  });
});

describe("add/get", () => {
  it("add 后 get 读回原文、标签、元数据，且 FSRS 已初始化（issue 02 语义）", async () => {
    await withTempDb(async (db) => {
      const added = await addJson(db, "测试记忆", [
        "--tag",
        "dev",
        "--tag",
        "pnpm",
        "--meta",
        "importance=high",
        "--meta",
        "url=http://x/?a=1",
      ]);
      expect(added.exitCode).toBe(0);
      expect(added.stderr).toBe("");
      expect(parseJson<AddJson>(added.stdout)).toEqual({ id: 1 });

      const memory = mustMemory(await run(["get", "1", "--db", db, "--json"]));
      expect(memory.text).toBe("测试记忆");
      expect(memory.tags).toEqual(["dev", "pnpm"]);
      expect(memory.meta).toEqual({ importance: "high", url: "http://x/?a=1" });
      expect(memory.state).toBe("active");
      expect(memory.reps).toBe(1);
      expect(memory.stability).toBeGreaterThan(0);
      expect(memory.difficulty).toBeGreaterThan(0);
      expect(new Date(memory.lastReview ?? "").getTime()).toBe(NOW.getTime());
      expect(new Date(memory.due ?? "").getTime()).toBeGreaterThanOrEqual(NOW.getTime() + DAY);
      expect(memory.fsrsState).toBe(2); // Review
      expect(memory.trashedAt).toBeNull();
    });
  });

  it("重复 add 返回既有 id，且不重复初始化 FSRS", async () => {
    await withTempDb(async (db) => {
      const first = await addJson(db, "同一个文本");
      expect(parseJson<AddJson>(first.stdout)).toEqual({ id: 1 });
      const again = await addJson(db, "同一个文本");
      expect(parseJson<AddJson>(again.stdout)).toEqual({ id: 1 });
      const list = await run(["list", "--db", db, "--json"]);
      expect(parseJson<ListJson>(list.stdout).memories).toHaveLength(1);
      expect(mustMemory(await run(["get", "1", "--db", db, "--json"])).reps).toBe(1);

      // 不同 run 允许重复（存储层语义）；text 模式提示已存在
      const otherRun = await run(["add", "同一个文本", "--run", "r2", "--db", db]);
      expect(otherRun.exitCode).toBe(0);
      const dupText = await run(["add", "同一个文本", "--db", db]);
      expect(dupText.stdout).toContain("已存在");
    });
  });

  it("add - 从 stdin 读取多行（去尾换行）", async () => {
    await withTempDb(async (db) => {
      const result = await run(["add", "-", "--db", db, "--json"]);
      expect(result.exitCode).toBe(0);
      expect(mustMemory(await run(["get", "1", "--db", db, "--json"])).text).toBe(
        "来自 stdin 的多行记忆\n第二行",
      );
    });
  });

  it("stdin 为空时 add - 报用法错误", async () => {
    const result = await run(["add", "-"], { readStdin: async () => "" });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("stdin 为空");
  });

  it("多个位置参数拼接为文本", async () => {
    await withTempDb(async (db) => {
      await run(["add", "hello", "world", "--db", db]);
      expect(mustMemory(await run(["get", "1", "--db", db, "--json"])).text).toBe("hello world");
    });
  });

  it("缺文本 / 空 tag / 非法 meta 均为用法错误（退出码 2）", async () => {
    expect((await run(["add", "--db", ":memory:"])).exitCode).toBe(2);
    expect((await run(["add", "x", "--tag", "", "--db", ":memory:"])).exitCode).toBe(2);
    expect((await run(["add", "x", "--meta", "novalue", "--db", ":memory:"])).exitCode).toBe(2);
    expect((await run(["add", "x", "--meta", "=v", "--db", ":memory:"])).exitCode).toBe(2);
  });

  it("get：缺 id / 非法 id 用法错误；不存在的 id 运行时错误", async () => {
    expect((await run(["get"])).exitCode).toBe(2);
    expect((await run(["get", "abc"])).exitCode).toBe(2);
    const missing = await run(["get", "999", "--db", ":memory:"]);
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain("提示:");
    expect(missing.stderr).toContain("不存在");
  });
});

describe("list", () => {
  it("默认只列 active；delete 后默认不含；--state 透传存储 state", async () => {
    await withTempDb(async (db) => {
      await addJson(db, "第一条");
      await addJson(db, "第二条");
      await run(["delete", "1", "--db", db]);
      const defaultList = parseJson<ListJson>((await run(["list", "--db", db, "--json"])).stdout);
      expect(defaultList.memories.map((m) => m.id)).toEqual([2]);
      const active = parseJson<ListJson>(
        (await run(["list", "--db", db, "--state", "active", "--json"])).stdout,
      );
      expect(active.memories.map((m) => m.id)).toEqual([2]);
      const trashed = parseJson<ListJson>(
        (await run(["list", "--db", db, "--state", "trashed", "--json"])).stdout,
      );
      expect(trashed.memories.map((m) => m.id)).toEqual([1]);
      expect(trashed.memories[0]?.state).toBe("trashed");
      const both = parseJson<ListJson>(
        (await run(["list", "--db", db, "--state", "active", "--state", "trashed", "--json"]))
          .stdout,
      );
      expect(both.memories).toHaveLength(2);
      expect((await run(["list", "--db", db, "--state", "bogus"])).exitCode).toBe(2);
    });
  });

  it("list 支持 --agent/--run/--tag/--limit 过滤，新纪录优先", async () => {
    await withTempDb(async (db) => {
      await run(["add", "m1", "--run", "r1", "--tag", "x", "--db", db]);
      await run(["add", "m2", "--run", "r2", "--tag", "y", "--db", db]);
      await run(["add", "m3", "--agent", "other", "--db", db]);
      const byAgent = parseJson<ListJson>(
        (await run(["list", "--db", db, "--agent", "my-agent", "--json"])).stdout,
      );
      expect(byAgent.memories.map((m) => m.text)).toEqual(["m2", "m1"]);
      const byRun = parseJson<ListJson>(
        (await run(["list", "--db", db, "--run", "r2", "--json"])).stdout,
      );
      expect(byRun.memories.map((m) => m.text)).toEqual(["m2"]);
      const byTag = parseJson<ListJson>(
        (await run(["list", "--db", db, "--tag", "x", "--json"])).stdout,
      );
      expect(byTag.memories.map((m) => m.text)).toEqual(["m1"]);
      const limited = parseJson<ListJson>(
        (await run(["list", "--db", db, "--agent", "*", "--limit", "2", "--json"])).stdout,
      );
      expect(limited.memories.map((m) => m.text)).toEqual(["m3", "m2"]);
      expect((await run(["list", "--db", db, "--limit", "0"])).exitCode).toBe(2);
      expect((await run(["list", "--db", db, "--limit", "-1"])).exitCode).toBe(2);
    });
  });

  it("空库 list 输出空数组 /（无记忆）", async () => {
    await withTempDb(async (db) => {
      const json = await run(["list", "--db", db, "--json"]);
      expect(parseJson<ListJson>(json.stdout).memories).toEqual([]);
      const text = await run(["list", "--db", db]);
      expect(text.stdout).toBe("（无记忆）\n");
    });
  });

  it("list 文本模式逐条一列", async () => {
    await withTempDb(async (db) => {
      await addJson(db, "可读列表");
      const text = await run(["list", "--db", db]);
      expect(text.stdout).toContain("#1 [active]");
      expect(text.stdout).toContain("可读列表");
    });
  });
});

describe("use", () => {
  it("use 默认 good：更新 last_review/reps/stability/due（与 issue 02 一致）", async () => {
    await withTempDb(async (db) => {
      let clock = NOW;
      const env = makeEnv({ now: () => clock });
      await runCli(["add", "复习对象", "--db", db], env);
      const before = (await runCli(["get", "1", "--db", db, "--json"], env)).stdout;
      const beforeStability = parseJson<MemoryJson>(before).memory.stability;

      clock = new Date(NOW.getTime() + 15 * DAY);
      const used = await runCli(["use", "1", "--db", db, "--json"], env);
      expect(used.exitCode).toBe(0);
      const memory = parseJson<MemoryJson>(used.stdout).memory;
      expect(memory.reps).toBe(2);
      expect(memory.stability).toBeGreaterThan(beforeStability);
      expect(new Date(memory.lastReview ?? "").getTime()).toBe(clock.getTime());
      expect(new Date(memory.due ?? "").getTime()).toBeGreaterThanOrEqual(clock.getTime() + DAY);
      expect(memory.fsrsState).toBe(2);
    });
  });

  it("use --grade 各评级合法；非法评级用法错误", async () => {
    await withTempDb(async (db) => {
      await addJson(db, "评级记忆");
      for (const grade of ["again", "hard", "good", "easy"]) {
        const result = await run(["use", "1", "--grade", grade, "--db", db]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`(${grade})`);
      }
      const bad = await run(["use", "1", "--grade", "manual", "--db", ":memory:"]);
      expect(bad.exitCode).toBe(2);
      expect(bad.stderr).toContain("Invalid grade");
      expect(bad.stderr).toContain("合法评级");
    });
  });

  it("use 不存在的 id 运行时错误（退出码 1）", async () => {
    const result = await run(["use", "999", "--db", ":memory:"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("不存在");
  });
});

describe("delete", () => {
  it("软删除：state=trashed + trashed_at；get 仍可读；FTS 同步（条目不再默认可见）", async () => {
    await withTempDb(async (db) => {
      await addJson(db, "待删除");
      const result = await run(["delete", "1", "--db", db, "--json"]);
      expect(result.exitCode).toBe(0);
      expect(parseJson<AddJson>(result.stdout)).toEqual({ id: 1 });
      const memory = mustMemory(await run(["get", "1", "--db", db, "--json"]));
      expect(memory.state).toBe("trashed");
      expect(memory.trashedAt).not.toBeNull();
      expect(memory.text).toBe("待删除");
      const list = parseJson<ListJson>((await run(["list", "--db", db, "--json"])).stdout);
      expect(list.memories).toHaveLength(0);
    });
  });

  it("delete 不存在的 id 运行时错误；重复 delete 幂等", async () => {
    await withTempDb(async (db) => {
      expect((await run(["delete", "42", "--db", db])).exitCode).toBe(1);
      await addJson(db, "幂等");
      expect((await run(["delete", "1", "--db", db])).exitCode).toBe(0);
      expect((await run(["delete", "1", "--db", db])).exitCode).toBe(0);
    });
  });

  it("get 文本模式展示全部字段", async () => {
    await withTempDb(async (db) => {
      await addJson(db, "全文", ["--tag", "t", "--meta", "k=v"]);
      const text = await run(["get", "1", "--db", db]);
      for (const fragment of [
        "#1 [active]",
        "文本: 全文",
        "标签: t",
        '元数据: {"k":"v"}',
        "last_review:",
        "due:",
        "stability:",
      ]) {
        expect(text.stdout).toContain(fragment);
      }
    });
  });
});

describe("stats", () => {
  it("总数/状态分布/FSRS 概览（平均 stability、总复习次数）", async () => {
    await withTempDb(async (db) => {
      await addJson(db, "s1");
      await addJson(db, "s2");
      await run(["delete", "1", "--db", db]);
      const result = await run(["stats", "--db", db, "--json"]);
      expect(result.exitCode).toBe(0);
      const stats = parseJson<StatsJson>(result.stdout);
      expect(stats.total).toBe(2);
      expect(stats.byState).toEqual({ active: 1, trashed: 1 });
      expect(stats.fsrs.averageStability).toBeGreaterThan(0);
      expect(stats.fsrs.averageDifficulty).toBeGreaterThan(0);
      expect(stats.fsrs.totalReps).toBe(2);
      expect(stats.fsrs.averageRetrievability).toBeGreaterThan(0);
      expect(stats.fsrs.averageRetrievability).toBeLessThanOrEqual(1);
      const text = await run(["stats", "--db", db]);
      expect(text.stdout).toContain("记忆统计");
      expect(text.stdout).toContain("active 1 · trashed 1");
      expect(text.stdout).toContain("平均 stability");
    });
  });

  it("空库 stats 全零", async () => {
    const result = await run(["stats", "--db", ":memory:", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(parseJson<StatsJson>(result.stdout).total).toBe(0);
    expect(parseJson<StatsJson>(result.stdout).fsrs.averageStability).toBe(0);
  });
});

describe("--dry-run", () => {
  it("add --dry-run 预演且不创建数据库", async () => {
    await withTempDb(async (db) => {
      const text = await run([
        "add",
        "预演记忆",
        "--tag",
        "t",
        "--meta",
        "k=v",
        "--dry-run",
        "--db",
        db,
      ]);
      expect(text.exitCode).toBe(0);
      expect(text.stdout).toContain('[dry-run] add 文本="预演记忆" agent="my-agent"');
      expect(existsSync(db)).toBe(false);

      const json = await run([
        "add",
        "预演记忆",
        "--tag",
        "t",
        "--meta",
        "k=v",
        "--dry-run",
        "--db",
        db,
        "--json",
      ]);
      const plan = parseJson<PlanJson>(json.stdout);
      expect(plan.dryRun).toBe(true);
      expect(plan.operations).toEqual([
        { op: "add", text: "预演记忆", agent: "my-agent", run: "", tags: ["t"], meta: { k: "v" } },
      ]);
      expect(existsSync(db)).toBe(false);
    });
  });

  it("use/delete --dry-run 预演且不创建数据库", async () => {
    await withTempDb(async (db) => {
      expect(
        (await run(["use", "7", "--grade", "again", "--dry-run", "--db", db])).stdout,
      ).toContain("[dry-run] use #7 grade=again");
      expect((await run(["delete", "7", "--dry-run", "--db", db])).stdout).toContain(
        "[dry-run] delete #7",
      );
      expect(existsSync(db)).toBe(false);
      const useJson = await run([
        "use",
        "7",
        "--grade",
        "again",
        "--dry-run",
        "--db",
        db,
        "--json",
      ]);
      expect(parseJson<PlanJson>(useJson.stdout).operations).toEqual([
        { op: "use", id: 7, grade: "again" },
      ]);
      const json = await run(["delete", "7", "--dry-run", "--db", db, "--json"]);
      expect(parseJson<PlanJson>(json.stdout).operations).toEqual([{ op: "delete", id: 7 }]);
    });
  });
});

describe("错误契约（退出码与 JSON 错误）", () => {
  it("无命令 / 未知命令 / 未知选项 → 用法错误（2）", async () => {
    const bare = await run([]);
    expect(bare.exitCode).toBe(2);
    expect(bare.stderr).toContain("缺少命令");
    expect(bare.stderr).toContain("提示:");

    const unknown = await run(["frobnicate"]);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr).toContain('未知命令 "frobnicate"');

    const badFlag = await run(["add", "x", "--nope"]);
    expect(badFlag.exitCode).toBe(2);
    expect(badFlag.stderr).toContain("--nope");
  });

  it('--json 错误契约：stderr 为 {"error":{code,message,hint?}}，stdout 为空', async () => {
    const result = await run(["frobnicate", "--json"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    const error = parseJson<ErrorJson>(result.stderr).error;
    expect(error.code).toBe("usage");
    expect(error.message).toContain("未知命令");
    expect(error.hint).toContain("可用命令");
  });

  it("--json 对解析失败同样生效（--json=<v> 形式）", async () => {
    const result = await run(["--json=1", "frobnicate"]);
    expect(result.exitCode).toBe(2);
    expect(parseJson<ErrorJson>(result.stderr).error.code).toBe("usage");
  });

  it("运行时错误（--json）：get 不存在 → code=runtime、退出码 1、含 hint", async () => {
    const result = await run(["get", "888", "--db", ":memory:", "--json"]);
    expect(result.exitCode).toBe(1);
    const error = parseJson<ErrorJson>(result.stderr).error;
    expect(error.code).toBe("runtime");
    expect(error.message).toContain("888");
    expect(error.hint).toContain("nm list");
  });

  it("命令专属选项外挂非法选项 → 用法错误", async () => {
    expect((await run(["add", "x", "--limit", "5"])).exitCode).toBe(2);
    expect((await run(["add", "x", "--limit", "5"])).stderr).toContain("不适用于命令 add");
    expect((await run(["use", "1", "--meta", "k=v"])).exitCode).toBe(2);
    // 合法挂载点不受影响
    expect((await run(["list", "--tag", "t", "--db", ":memory:", "--json"])).exitCode).toBe(0);
  });
});

describe("数据库路径与初始化", () => {
  it("默认路径的父目录自动创建（多级）", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nano-mem-dir-"));
    try {
      const db = join(dir, "a", "b", "mem.db");
      const result = await run(["add", "嵌套目录", "--db", db, "--json"]);
      expect(result.exitCode).toBe(0);
      expect(existsSync(db)).toBe(true);
      const got = await run(["get", "1", "--db", db, "--json"]);
      expect(mustMemory(got).text).toBe("嵌套目录");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it(":memory: 库也可用（不建目录、不写文件）", async () => {
    const result = await run(["stats", "--db", ":memory:", "--json"]);
    expect(result.exitCode).toBe(0);
  });
});

describe("search（issue 04 检索排序）", () => {
  it("search 中文/英文命中：返回 score 降序，JSON 含 score/relevance/strength/state", async () => {
    await withTempDb(async (db) => {
      await addJson(db, "记忆信息很关键");
      await addJson(db, "窗口管理指南");
      const res = await run(["search", "记忆", "--db", db, "--json"]);
      expect(res.exitCode).toBe(0);
      expect(res.stderr).toBe("");
      const { results } = parseJson<SearchJson>(res.stdout);
      expect(results).toHaveLength(1);
      const r = results[0] as (typeof results)[number];
      expect(r.id).toBe(1);
      expect(r.text).toBe("记忆信息很关键");
      expect(r.state).toBe("active");
      expect(r.relevance).toBeGreaterThan(0.5);
      expect(r.relevance).toBeLessThan(1);
      expect(r.strength).toBe(1);
      // 融合公式：0.65 × rel + 0.35 × R
      expect(r.score).toBeCloseTo(0.65 * r.relevance + 0.35 * r.strength, 9);

      const en = parseJson<SearchJson>(
        (await run(["search", "窗口", "--db", db, "--json"])).stdout,
      );
      expect(en.results.map((item) => item.id)).toEqual([2]);

      const none = await run(["search", "绝对不存在的词", "--db", db]);
      expect(none.exitCode).toBe(0);
      expect(none.stdout).toBe("（无结果）\n");
    });
  });

  it("未命中项不进结果（无相关性的记忆不因 R 高上榜）", async () => {
    await withTempDb(async (db) => {
      await addJson(db, "窗口管理指南");
      await addJson(db, "记忆信息很关键");
      // 默认 min-score 0.35 时 R=1 的未命中项若被纳入将恰好达阈值
      const res = parseJson<SearchJson>(
        (await run(["search", "窗口", "--db", db, "--json"])).stdout,
      );
      expect(res.results.map((item) => item.id)).toEqual([1]);
    });
  });

  it("默认对命中记录一次 Hard（自动弱使用）；--no-touch 不写 FSRS", async () => {
    await withTempDb(async (db) => {
      await addJson(db, "记忆信息很关键");
      expect(mustMemory(await run(["get", "1", "--db", db, "--json"])).reps).toBe(1);

      await run(["search", "记忆", "--db", db]);
      let memory = mustMemory(await run(["get", "1", "--db", db, "--json"]));
      expect(memory.reps).toBe(2);
      expect(memory.lastReview).toBe(NOW.toISOString());

      await run(["search", "记忆", "--db", db, "--no-touch"]);
      memory = mustMemory(await run(["get", "1", "--db", db, "--json"]));
      expect(memory.reps).toBe(2); // --no-touch 未再写入

      // --dry-run 同样不触碰
      await run(["search", "记忆", "--db", db, "--dry-run"]);
      expect(mustMemory(await run(["get", "1", "--db", db, "--json"])).reps).toBe(2);
    });
  });

  it("连续 use(good) 后同查询 rank 上升或不降（构造 R 差异）", async () => {
    await withTempDb(async (db) => {
      let clock = NOW;
      const env = makeEnv({ now: () => clock });
      await runCli(["add", "窗口管理指南", "--db", db], env);
      await runCli(
        ["add", "窗口装饰技巧与更多长文本词汇填充内容以增加文档长度并拉低相关性", "--db", db],
        env,
      );
      // 老化 #1：3 次 Again（R ≈ 0.39，仍 active）；#2 保持强记忆
      for (let i = 1; i <= 3; i++) {
        clock = new Date(NOW.getTime() + 30 * i * DAY);
        await runCli(["use", "1", "--grade", "again", "--db", db], env);
      }
      clock = new Date(NOW.getTime() + 290 * DAY);
      await runCli(["use", "2", "--grade", "good", "--db", db], env); // #2 回满（R=1）
      const before = parseJson<SearchJson>(
        (await runCli(["search", "窗口", "--db", db, "--json"], env)).stdout,
      );
      expect(before.results.map((item) => item.id)).toEqual([2, 1]); // #1 R 低 → 靠后

      await runCli(["use", "1", "--grade", "good", "--db", db], env); // #1 回满（R=1）
      const after = parseJson<SearchJson>(
        (await runCli(["search", "窗口", "--db", db, "--json"], env)).stdout,
      );
      expect(after.results[0]?.id).toBe(1); // rank 上升为第 1
      expect(after.results[0]?.strength).toBe(1);
      // #2 排名不降于使用后的比较基准（#2 仍为次席）
      expect(after.results.map((item) => item.id)).toEqual([1, 2]);
    });
  });

  it("时间推进 R 衰减 → dormant：search 默认隐藏、--include-dormant 可见且 state=dormant", async () => {
    await withTempDb(async (db) => {
      let clock = NOW;
      const env = makeEnv({ now: () => clock });
      await runCli(["add", "窗口管理指南", "--db", db], env);
      for (let i = 1; i <= 6; i++) {
        clock = new Date(NOW.getTime() + 30 * i * DAY);
        await runCli(["use", "1", "--grade", "again", "--db", db], env);
      }
      clock = new Date(NOW.getTime() + 380 * DAY); // 距最后复习 200 天 → R < 0.35

      const hidden = parseJson<SearchJson>(
        (await runCli(["search", "窗口", "--db", db, "--json"], env)).stdout,
      );
      expect(hidden.results).toHaveLength(0);

      const shown = parseJson<SearchJson>(
        (
          await runCli(
            ["search", "窗口", "--db", db, "--include-dormant", "--no-touch", "--json"],
            env,
          )
        ).stdout,
      );
      expect(shown.results).toHaveLength(1);
      expect(shown.results[0]?.state).toBe("dormant");
      expect(shown.results[0]?.strength).toBeLessThan(0.35);
      expect(shown.results[0]?.score).toBeGreaterThanOrEqual(0.35);
    });
  });

  it("--score-weights / --min-score / --limit 覆盖生效", async () => {
    await withTempDb(async (db) => {
      await addJson(db, "窗口管理指南");
      await addJson(db, "记忆信息很关键");
      const weighted = parseJson<SearchJson>(
        (
          await run([
            "search",
            "窗口",
            "--score-weights",
            "rel=0.8,strength=0.2",
            "--db",
            db,
            "--json",
          ])
        ).stdout,
      );
      const r = weighted.results[0] as (typeof weighted.results)[number];
      expect(r.score).toBeCloseTo(0.8 * r.relevance + 0.2 * r.strength, 9);

      // min-score 提高到 0.99 → 低于阈值被过滤；limit=1 → 只返回 1 条
      expect(
        (await run(["search", "记忆", "--min-score", "0.99", "--db", db, "--json"])).stdout,
      ).toBe('{"results":[]}\n');
      await addJson(db, "窗口装饰技巧");
      const limited = parseJson<SearchJson>(
        (await run(["search", "窗口", "--limit", "1", "--db", db, "--json"])).stdout,
      );
      expect(limited.results).toHaveLength(1);
    });
  });

  it("search --agent/--run/--tag 过滤", async () => {
    await withTempDb(async (db) => {
      await run(["add", "记忆信息很关键", "--tag", "core", "--db", db]);
      await run(["add", "记忆备份策略", "--run", "r2", "--tag", "ops", "--db", db]);
      await run(["add", "记忆信息很关键", "--agent", "other", "--db", db]);
      const byAgent = parseJson<SearchJson>(
        (await run(["search", "记忆", "--agent", "my-agent", "--db", db, "--json"])).stdout,
      );
      expect(byAgent.results.map((item) => item.text).sort()).toEqual([
        "记忆信息很关键",
        "记忆备份策略",
      ]);
      const byTag = parseJson<SearchJson>(
        (await run(["search", "记忆", "--tag", "core", "--db", db, "--json"])).stdout,
      );
      expect(byTag.results.map((item) => item.id)).toEqual([1]);
      const byRun = parseJson<SearchJson>(
        (await run(["search", "记忆", "--run", "r2", "--db", db, "--json"])).stdout,
      );
      expect(byRun.results.map((item) => item.id)).toEqual([2]);
    });
  });

  it("search 用法错误：缺查询 / min-score 越界 / 权重非法 / limit 非法 / 选项不适用", async () => {
    expect((await run(["search", "--db", ":memory:"])).exitCode).toBe(2);
    expect((await run(["search", "x", "--min-score", "1.5", "--db", ":memory:"])).exitCode).toBe(2);
    expect((await run(["search", "x", "--min-score", "-0.1", "--db", ":memory:"])).exitCode).toBe(
      2,
    );
    expect(
      (await run(["search", "x", "--score-weights", "rel=0.5", "--db", ":memory:"])).exitCode,
    ).toBe(2);
    expect(
      (await run(["search", "x", "--score-weights", "rel=0.8,strength=0.3", "--db", ":memory:"]))
        .exitCode,
    ).toBe(2);
    expect((await run(["search", "x", "--limit", "0", "--db", ":memory:"])).exitCode).toBe(2);
    expect((await run(["search", "x", "--grade", "good", "--db", ":memory:"])).exitCode).toBe(2);
  });
});

describe("检索与列表默认分区（issue 08）", () => {
  it("未传 --agent 时 search/list 只返回当前 cwd 分区；--agent <name> 覆盖；--agent * 跨分区", async () => {
    await withTempDb(async (db) => {
      const envA = makeEnv({ cwd: "C:/work/agent-a" });
      const envB = makeEnv({ cwd: "C:/work/agent-b" });
      await runCli(["add", "甲方记忆", "--db", db], envA);
      await runCli(["add", "乙方记忆", "--db", db], envB);

      // 默认：cwd=agent-a → 只含 a 分区
      const listA = parseJson<ListJson>(
        (await runCli(["list", "--db", db, "--json"], envA)).stdout,
      );
      expect(listA.memories.map((m) => m.text)).toEqual(["甲方记忆"]);
      const searchA = parseJson<SearchJson>(
        (await runCli(["search", "记忆", "--no-touch", "--db", db, "--json"], envA)).stdout,
      );
      expect(searchA.results.map((r) => r.text)).toEqual(["甲方记忆"]);

      // 默认：cwd=agent-b → 只含 b 分区
      const listB = parseJson<ListJson>(
        (await runCli(["list", "--db", db, "--json"], envB)).stdout,
      );
      expect(listB.memories.map((m) => m.text)).toEqual(["乙方记忆"]);
      const searchB = parseJson<SearchJson>(
        (await runCli(["search", "记忆", "--no-touch", "--db", db, "--json"], envB)).stdout,
      );
      expect(searchB.results.map((r) => r.text)).toEqual(["乙方记忆"]);

      // 显式 --agent 覆盖默认分区
      const explicit = parseJson<SearchJson>(
        (
          await runCli(
            ["search", "记忆", "--agent", "agent-b", "--no-touch", "--db", db, "--json"],
            envA,
          )
        ).stdout,
      );
      expect(explicit.results.map((r) => r.text)).toEqual(["乙方记忆"]);
      const explicitList = parseJson<ListJson>(
        (await runCli(["list", "--agent", "agent-a", "--db", db, "--json"], envA)).stdout,
      );
      expect(explicitList.memories.map((m) => m.text)).toEqual(["甲方记忆"]);

      // --agent * 跨分区：两个分区都命中
      const allSearch = parseJson<SearchJson>(
        (await runCli(["search", "记忆", "--agent", "*", "--no-touch", "--db", db, "--json"], envA))
          .stdout,
      );
      expect(allSearch.results.map((r) => r.text).sort()).toEqual(["乙方记忆", "甲方记忆"]);
      const allList = parseJson<ListJson>(
        (await runCli(["list", "--agent", "*", "--db", db, "--json"], envA)).stdout,
      );
      expect(allList.memories.map((m) => m.text).sort()).toEqual(["乙方记忆", "甲方记忆"]);
    });
  });

  it("--help 说明 --agent 默认当前目录名与 * 跨分区语义", async () => {
    const result = await run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("默认当前目录名");
    expect(result.stdout).toContain("跨分区");
  });
});

describe("list 惰性状态（issue 04）", () => {
  it("--state active/dormant/trashed/all 按惰性有效状态过滤；默认仅有效 active", async () => {
    await withTempDb(async (db) => {
      let clock = NOW;
      const env = makeEnv({ now: () => clock });
      await runCli(["add", "优雅记忆", "--db", db], env); // #1 活跃
      await runCli(["add", "漂泊记忆", "--db", db], env); // #2 被遗忘链路
      await runCli(["add", "历史记忆", "--db", db], env); // #3 手动删除
      await runCli(["delete", "3", "--db", db], env);
      for (let i = 1; i <= 6; i++) {
        clock = new Date(NOW.getTime() + 30 * i * DAY);
        await runCli(["use", "2", "--grade", "again", "--db", db], env);
      }
      clock = new Date(NOW.getTime() + 380 * DAY);

      const all = parseJson<ListJson>(
        (await runCli(["list", "--state", "all", "--db", db, "--json"], env)).stdout,
      );
      expect(all.memories.map((item) => item.id).sort((a, b) => a - b)).toEqual([1, 2, 3]);
      const active = parseJson<ListJson>(
        (await runCli(["list", "--state", "active", "--db", db, "--json"], env)).stdout,
      );
      expect(active.memories.map((item) => item.id)).toEqual([1]);
      const dormant = parseJson<ListJson>(
        (await runCli(["list", "--state", "dormant", "--db", db, "--json"], env)).stdout,
      );
      expect(dormant.memories.map((item) => item.id)).toEqual([2]);
      expect(dormant.memories[0]?.state).toBe("dormant");
      const trashed = parseJson<ListJson>(
        (await runCli(["list", "--state", "trashed", "--db", db, "--json"], env)).stdout,
      );
      expect(trashed.memories.map((item) => item.id)).toEqual([3]);
      const defaultList = parseJson<ListJson>(
        (await runCli(["list", "--db", db, "--json"], env)).stdout,
      );
      expect(defaultList.memories.map((item) => item.id)).toEqual([1]); // 默认仅有效 active
      expect((await runCli(["list", "--state", "bogus", "--db", db], env)).exitCode).toBe(2);
    });
  });
});

describe("gc（issue 04 遗忘状态机）", () => {
  it("gc --dry-run 输出计划且零副作用；真实执行标删 R<0.10 与休眠>180 天记录", async () => {
    await withTempDb(async (db) => {
      let clock = NOW;
      const env = makeEnv({ now: () => clock });
      await runCli(["add", "窗口管理指南", "--db", db], env); // #1 长期休眠 → 标删
      await runCli(["add", "记忆信息很关键", "--db", db], env); // #2 R<0.10（外部改写）
      await runCli(["add", "数据库索引设计", "--db", db], env); // #3 keeper
      for (let i = 1; i <= 6; i++) {
        clock = new Date(NOW.getTime() + 30 * i * DAY);
        await runCli(["use", "1", "--grade", "again", "--db", db], env);
      }
      // 测试夹具：直接改写 #2 的 FSRS 列为 New 态（R 恒为 0 < 0.10）
      const raw = new DatabaseSync(db);
      const past = new Date(NOW.getTime() - 100 * DAY).toISOString();
      raw
        .prepare(
          "UPDATE memories SET stability = 0.001, difficulty = 2.1, due = ?, last_review = ?, " +
            "reps = 1, lapses = 0, fsrs_state = 0 WHERE id = 2",
        )
        .run(past, past);
      raw.close();

      clock = new Date(NOW.getTime() + 380 * DAY);
      const dry = await runCli(["gc", "--dry-run", "--db", db, "--json"], env);
      expect(dry.exitCode).toBe(0);
      const dryReport = parseJson<GcJson>(dry.stdout);
      expect(dryReport.dryRun).toBe(true);
      expect([...dryReport.report.toTrash].sort((a, b) => a - b)).toEqual([1, 2]);
      expect(dryReport.report.toPurge).toEqual([]);
      // 零副作用：#1 仍 active、仍可命中 FTS（惰性休眠态需 --include-dormant 可见）
      expect((await runCli(["get", "1", "--db", db, "--json"], env)).exitCode).toBe(0);
      expect(
        parseJson<SearchJson>(
          (
            await runCli(
              ["search", "窗口", "--db", db, "--include-dormant", "--no-touch", "--json"],
              env,
            )
          ).stdout,
        ).results.map((item) => item.id),
      ).toEqual([1]);
      const dryText = await runCli(["gc", "--dry-run", "--db", db], env);
      expect(dryText.stdout).toContain("[dry-run] gc 扫描 3 条记忆");

      // 真实执行
      const done = await runCli(["gc", "--db", db, "--json"], env);
      expect(done.exitCode).toBe(0);
      const doneReport = parseJson<GcJson>(done.stdout);
      expect([...doneReport.report.toTrash].sort((a, b) => a - b)).toEqual([1, 2]);
      expect(mustMemory(await runCli(["get", "1", "--db", db, "--json"], env)).state).toBe(
        "trashed",
      );
      expect(mustMemory(await runCli(["get", "2", "--db", db, "--json"], env)).state).toBe(
        "trashed",
      );
      expect(mustMemory(await runCli(["get", "3", "--db", db, "--json"], env)).state).toBe(
        "active",
      );
      // 标删后 FTS 移除：不再命中
      expect(
        parseJson<SearchJson>(
          (await runCli(["search", "窗口", "--db", db, "--no-touch", "--json"], env)).stdout,
        ).results,
      ).toEqual([]);
    });
  });

  it("gc 清除 trashed 超保留期记录（--retention-days 可调）", async () => {
    await withTempDb(async (db) => {
      let clock = NOW;
      const env = makeEnv({ now: () => clock });
      await runCli(["add", "旧记录", "--db", db], env); // #1
      clock = new Date(NOW.getTime() - 40 * DAY);
      await runCli(["delete", "1", "--db", db], env); // 40 天前删除（trashed_at 跟随注入时钟）
      clock = NOW;

      const res = await runCli(["gc", "--db", db, "--json"], env);
      const report = parseJson<GcJson>(res.stdout).report;
      expect(report.toPurge).toEqual([1]);
      expect((await runCli(["get", "1", "--db", db, "--json"], env)).exitCode).toBe(1);

      // 保留期调大 → 不清除：新加一条再删除（40 天前），gc --retention-days 45 保留
      await runCli(["add", "旧记录二", "--db", db], env); // #2
      clock = new Date(NOW.getTime() - 40 * DAY);
      await runCli(["delete", "2", "--db", db], env);
      clock = NOW;
      const lenient = await runCli(["gc", "--retention-days", "45", "--db", db, "--json"], env);
      expect(parseJson<GcJson>(lenient.stdout).report.toPurge).toEqual([]);
      expect(mustMemory(await runCli(["get", "2", "--db", db, "--json"], env)).state).toBe(
        "trashed",
      );
    });
  });

  it("gc 用法错误：--retention-days 非法", async () => {
    expect((await run(["gc", "--retention-days", "0", "--db", ":memory:"])).exitCode).toBe(2);
    expect((await run(["gc", "--retention-days", "-1", "--db", ":memory:"])).exitCode).toBe(2);
    expect((await run(["gc", "--retention-days", "abc", "--db", ":memory:"])).exitCode).toBe(2);
  });
});
