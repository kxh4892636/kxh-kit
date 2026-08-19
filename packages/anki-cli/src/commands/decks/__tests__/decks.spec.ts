import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../../../cli/run";
import { JsonError } from "../../../cli/json-error";
import { makeClient } from "../../../test-helpers/make-client";
import {
  startFakeAnkiConnect,
  type FakeAnkiConnect,
  type FakeResponder,
} from "../../../test-fixtures/fake-anki-connect";
import { runChangeDeck } from "../change-deck-command";
import { runCreateDeck } from "../create-deck-command";
import { runDeckStats } from "../deck-stats-command";
import { runListDecks } from "../list-decks-command";

const servers: FakeAnkiConnect[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  vi.restoreAllMocks();
  process.exitCode = 0;
});

const start = async (responder: FakeResponder): Promise<string> => {
  const server = await startFakeAnkiConnect(responder);
  servers.push(server);
  return server.url;
};

describe("runListDecks", () => {
  it("不带 stats: 只返回牌组名", async () => {
    const url = await start((req) => {
      if (req.action === "deckNames") return { result: ["A", "A::B"] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runListDecks(makeClient(url), {});

    expect(result).toMatchObject({
      success: true,
      decks: [{ name: "A" }, { name: "A::B" }],
      total: 2,
    });
    expect(result.summary).toBeUndefined();
  });

  it("带 stats: 按 deck_id 匹配子牌组短名, 汇总只对根牌组求和", async () => {
    const url = await start((req) => {
      switch (req.action) {
        case "deckNames":
          return { result: ["German", "German::Verbs"] };
        case "deckNamesAndIds":
          return { result: { German: 1, "German::Verbs": 2 } };
        case "getDeckStats":
          return {
            result: {
              "1": {
                deck_id: 1,
                name: "German",
                new_count: 2,
                learn_count: 1,
                review_count: 3,
                total_in_deck: 10,
              },
              "2": {
                deck_id: 2,
                name: "Verbs",
                new_count: 1,
                learn_count: 0,
                review_count: 2,
                total_in_deck: 5,
              },
            },
          };
        default:
          throw new Error(`unexpected action ${req.action}`);
      }
    });

    const result = await runListDecks(makeClient(url), { includeStats: true });

    expect(result.decks).toEqual([
      {
        name: "German",
        stats: {
          deck_id: 1,
          name: "German",
          new_count: 2,
          learn_count: 1,
          review_count: 3,
          total_new: 2,
          total_cards: 10,
        },
      },
      {
        name: "German::Verbs",
        stats: {
          deck_id: 2,
          name: "German::Verbs",
          new_count: 1,
          learn_count: 0,
          review_count: 2,
          total_new: 1,
          total_cards: 5,
        },
      },
    ]);
    // total_cards 对全部牌组求和; 三个调度桶只对根牌组求和
    expect(result.summary).toEqual({
      total_cards: 15,
      new_cards: 2,
      learning_cards: 1,
      review_cards: 3,
    });
  });

  it("无牌组时返回空列表", async () => {
    const url = await start((req) => {
      if (req.action === "deckNames") return { result: [] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runListDecks(makeClient(url), {});

    expect(result).toMatchObject({ success: true, decks: [], total: 0 });
    expect(result.message).toContain("No decks");
  });
});

describe("runCreateDeck", () => {
  it("创建成功返回 deckId", async () => {
    const url = await start((req) => {
      if (req.action === "createDeck") return { result: 42 };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runCreateDeck(makeClient(url), { deckName: "German" });

    expect(result).toMatchObject({
      success: true,
      deckId: 42,
      deckName: "German",
      created: true,
    });
  });

  it("父::子且父已存在时如实报告 parentExisted", async () => {
    const url = await start((req) => {
      if (req.action === "deckNames") return { result: ["Japanese"] };
      if (req.action === "createDeck") return { result: 7 };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runCreateDeck(makeClient(url), {
      deckName: "Japanese::JLPT N5",
    });

    expect(result).toMatchObject({
      success: true,
      created: true,
      parentDeck: "Japanese",
      childDeck: "JLPT N5",
      parentExisted: true,
    });
    expect(result.message).toContain("Found existing parent");
  });

  it("超过 2 层报错", async () => {
    const url = await start(() => ({ result: null }));

    try {
      await runCreateDeck(makeClient(url), { deckName: "A::B::C" });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonError);
      expect((error as JsonError).action).toBe("createDeck");
      expect((error as JsonError).message).toContain("maximum 2 levels");
    }
  });

  it("已存在时 created=false 且 exists=true", async () => {
    const url = await start((req) => {
      if (req.action === "createDeck") return { result: 0 };
      if (req.action === "deckNames") return { result: ["German"] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runCreateDeck(makeClient(url), { deckName: "German" });

    expect(result).toMatchObject({ success: true, created: false, exists: true });
  });
});

describe("runChangeDeck", () => {
  it("移动成功", async () => {
    const url = await start((req) => {
      if (req.action === "cardsInfo") return { result: [{ cardId: 1 }, { cardId: 2 }] };
      if (req.action === "changeDeck") return { result: null };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runChangeDeck(makeClient(url), {
      deck: "German",
      cards: [1, 2],
    });

    expect(result).toMatchObject({
      success: true,
      cardsAffected: 2,
      targetDeck: "German",
    });
  });

  it("无效 ID 全部拒绝(不移动)", async () => {
    const url = await start((req) => {
      if (req.action === "cardsInfo") return { result: [{ cardId: 1 }, {}] };
      throw new Error(`unexpected action ${req.action}`);
    });

    try {
      await runChangeDeck(makeClient(url), { deck: "German", cards: [1, 2] });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonError);
      expect((error as JsonError).action).toBe("changeDeck");
      expect((error as JsonError).details).toMatchObject({
        invalidIds: [2],
        totalRequested: 2,
      });
      expect((error as JsonError).message).toContain("No cards were moved");
    }
  });
});

describe("runDeckStats", () => {
  const deckStatsResponder: FakeResponder = (req) => {
    switch (req.action) {
      case "deckNamesAndIds":
        return { result: { German: 1, "German::Verbs": 2 } };
      case "getDeckStats":
        return {
          result: {
            "1": {
              deck_id: 1,
              name: "German",
              new_count: 2,
              learn_count: 1,
              review_count: 3,
              total_in_deck: 10,
            },
            "2": {
              deck_id: 2,
              name: "Verbs",
              new_count: 1,
              learn_count: 0,
              review_count: 2,
              total_in_deck: 5,
            },
          },
        };
      case "findCards": {
        const query = (req.params?.["query"] as string) ?? "";
        if (query.includes("is:new")) return { result: [101, 102] };
        // review 查询里含 "is:learn" 片段, 必须先判 is:review
        if (query.includes("is:review")) return { result: [] };
        if (query.includes("is:learn")) return { result: [103] };
        if (query.includes("is:")) return { result: [] };
        return { result: [101, 102, 103] };
      }
      case "getEaseFactors":
        return { result: [2100, 2500, 3000] };
      case "getIntervals":
        return { result: [7, -60, 100] };
      default:
        throw new Error(`unexpected action ${req.action}`);
    }
  };

  it("counts/states/ease/intervals 完整统计", async () => {
    const url = await start(deckStatsResponder);

    const result = await runDeckStats(makeClient(url), { deck: "German" });

    expect(result.counts).toEqual({
      total: 15,
      new: 2,
      learning: 1,
      review: 3,
      other: 9,
    });
    expect(result.states).toEqual({
      new: 2,
      learning: 1,
      review: 0,
      suspended: 0,
      buried: 0,
    });
    expect(result.ease.buckets).toEqual({
      "<2": 0,
      "2-2.5": 1,
      "2.5-3": 1,
      ">3": 1,
    });
    expect(result.intervals.buckets).toEqual({
      "<7d": 0,
      "7-21d": 1,
      "21-90d": 0,
      ">90d": 1,
    });
  });

  it("空牌组路径: 状态全零与空分布", async () => {
    const url = await start((req) => {
      if (req.action === "deckNamesAndIds") return { result: { German: 1 } };
      if (req.action === "getDeckStats")
        return {
          result: {
            "1": {
              deck_id: 1,
              name: "German",
              new_count: 0,
              learn_count: 0,
              review_count: 0,
              total_in_deck: 0,
            },
          },
        };
      if (req.action === "findCards") return { result: [] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runDeckStats(makeClient(url), { deck: "German" });

    expect(result.counts).toEqual({
      total: 0,
      new: 0,
      learning: 0,
      review: 0,
      other: 0,
    });
    expect(result.states).toEqual({
      new: 0,
      learning: 0,
      review: 0,
      suspended: 0,
      buried: 0,
    });
    expect(result.ease.count).toBe(0);
    expect(result.intervals.count).toBe(0);
  });

  it("牌组不存在报错", async () => {
    const url = await start((req) => {
      if (req.action === "deckNamesAndIds") return { result: { German: 1 } };
      throw new Error(`unexpected action ${req.action}`);
    });

    await expect(runDeckStats(makeClient(url), { deck: "Missing" })).rejects.toMatchObject({
      name: "JsonError",
      action: "deckStats",
    });
  });
});

describe("CLI 端到端(decks 组)", () => {
  it("decks list 输出 success JSON, 退出码 0", async () => {
    const url = await start((req) => {
      if (req.action === "deckNames") return { result: ["A"] };
      throw new Error(`unexpected action ${req.action}`);
    });
    const stdout: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await runCli(["decks", "list", "--anki-connect", url]);

    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(parsed).toMatchObject({ success: true, total: 1 });
  });

  it("decks create 三级名: stderr 错误 JSON, 退出码 1", async () => {
    const url = await start(() => ({ result: null }));
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    await runCli(["decks", "create", "A::B::C", "--anki-connect", url]);

    expect(process.exitCode).toBe(1);
    const last = stderr.join("").trimEnd().split("\n").at(-1) ?? "";
    // 错误 JSON 是单次 write 的完整块(内部含换行), 取最后一块
    const blocks = stderr.filter((b) => b.trim().startsWith("{"));
    expect(blocks.length).toBeGreaterThan(0);
    expect(JSON.parse(blocks.at(-1) ?? "{}")).toMatchObject({
      success: false,
      action: "createDeck",
    });
    void last;
  });
});
