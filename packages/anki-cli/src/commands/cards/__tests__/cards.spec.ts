import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonError } from "../../../cli/json-error";
import { runCli } from "../../../cli/run";
import { makeClient } from "../../../test-helpers/make-client";
import {
  startFakeAnkiConnect,
  type FakeAnkiConnect,
  type FakeResponder,
} from "../../../test-fixtures/fake-anki-connect";
import { runGetDueCards } from "../due-command";
import { runGetCards } from "../list-command";
import { runPresentCard } from "../present-command";
import { runRateCard } from "../rate-command";

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

const cardInfo = (cardId: number) => ({
  cardId,
  fields: {},
  fieldOrder: 0,
  question: "Q",
  answer: 'Q<hr id="answer">A',
  modelName: "Basic",
  ord: 0,
  deckName: "D",
  css: "",
  type: 2,
  queue: 2,
  note: cardId,
  interval: 5,
  factor: 2500,
  due: 3,
});

describe("runGetDueCards", () => {
  it("返回简化卡片(渲染提取正反面)", async () => {
    const url = await start((req) => {
      if (req.action === "findCards") return { result: [101, 102] };
      if (req.action === "cardsInfo") return { result: [cardInfo(101), cardInfo(102)] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGetDueCards(makeClient(url), { limit: 10 });

    expect(result).toMatchObject({ success: true, total: 2, returned: 2 });
    expect(result.cards[0]).toMatchObject({ cardId: 101, front: "Q", back: "A" });
  });

  it("牌组名经 deckScopeQuery 转义", async () => {
    const queries: string[] = [];
    const url = await start((req) => {
      if (req.action === "findCards") {
        queries.push(req.params?.["query"] as string);
        return { result: [] };
      }
      throw new Error(`unexpected action ${req.action}`);
    });

    await runGetDueCards(makeClient(url), { deckName: "JLPT_N5" });

    expect(queries[0]).toBe('"deck:JLPT\\_N5" -is:suspended (is:due OR is:learn)');
  });

  it("include-new 时分开统计 new/due", async () => {
    const url = await start((req) => {
      if (req.action === "findCards") {
        const query = req.params?.["query"] as string;
        if (query.includes("(is:new)")) return { result: [103] };
        return { result: [101, 102, 103] };
      }
      if (req.action === "cardsInfo")
        return {
          result: [cardInfo(101), cardInfo(102), cardInfo(103)],
        };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGetDueCards(makeClient(url), { includeNew: true });

    expect(result.message).toContain("(1 new, 2 due)");
  });

  it("无到期卡片返回空列表", async () => {
    const url = await start((req) => {
      if (req.action === "findCards") return { result: [] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runGetDueCards(makeClient(url), {});

    expect(result).toMatchObject({ success: true, cards: [], total: 0 });
  });
});

describe("runGetCards", () => {
  it("默认 due 且排除 suspended", async () => {
    const queries: string[] = [];
    const url = await start((req) => {
      if (req.action === "findCards") {
        queries.push(req.params?.["query"] as string);
        return { result: [1] };
      }
      if (req.action === "cardsInfo") return { result: [cardInfo(1)] };
      throw new Error(`unexpected action ${req.action}`);
    });

    await runGetCards(makeClient(url), {});

    expect(queries[0]).toBe("-is:suspended is:due");
  });

  it("suspended 状态不加排除前缀", async () => {
    const queries: string[] = [];
    const url = await start((req) => {
      if (req.action === "findCards") {
        queries.push(req.params?.["query"] as string);
        return { result: [] };
      }
      throw new Error(`unexpected action ${req.action}`);
    });

    await runGetCards(makeClient(url), { cardState: "suspended" });

    expect(queries[0]).toBe("is:suspended");
  });
});

describe("runPresentCard", () => {
  it("默认只输出正面", async () => {
    const url = await start((req) => {
      if (req.action === "cardsInfo") return { result: [cardInfo(7)] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runPresentCard(makeClient(url), { cardId: 7 });

    expect(result.success).toBe(true);
    expect(result.card.front).toBe("Q");
    expect(result.card.back).toBeUndefined();
    expect(result.instruction).toContain("--answer");
  });

  it("--answer 附带背面", async () => {
    const url = await start((req) => {
      if (req.action === "cardsInfo") return { result: [cardInfo(7)] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runPresentCard(makeClient(url), {
      cardId: 7,
      showAnswer: true,
    });

    expect(result.card.back).toBe("A");
  });

  it("卡片不存在报错", async () => {
    const url = await start((req) => {
      if (req.action === "cardsInfo") return { result: [] };
      throw new Error(`unexpected action ${req.action}`);
    });

    await expect(runPresentCard(makeClient(url), { cardId: 999 })).rejects.toMatchObject({
      name: "JsonError",
      action: "present_card",
    });
  });
});

describe("runRateCard", () => {
  const okResponder: FakeResponder = (req) => {
    if (req.action === "cardsInfo") {
      const cards = (req.params?.["cards"] ?? []) as number[];
      if (cards[0] === 7) {
        return { result: [{ cardId: 7 }] };
      }
      return { result: [{}] };
    }
    if (req.action === "answerCards") return { result: true };
    throw new Error(`unexpected action ${req.action}`);
  };

  it("评分成功返回 nextReview", async () => {
    const url = await start(okResponder);

    const result = await runRateCard(makeClient(url), { cardId: 7, rating: 3 });

    expect(result).toMatchObject({
      success: true,
      rating: 3,
      ratingDescription: "Good (recalled with some effort)",
    });
  });

  it("非法评分拒绝", async () => {
    const url = await start(okResponder);

    await expect(runRateCard(makeClient(url), { cardId: 7, rating: 5 })).rejects.toThrow(
      /Invalid rating/,
    );
  });

  it("不存在的卡片拒绝并提示验证 ID", async () => {
    const url = await start(okResponder);

    try {
      await runRateCard(makeClient(url), { cardId: 999, rating: 3 });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonError);
      expect((error as JsonError).hint).toContain("Verify the card ID");
    }
  });
});

describe("CLI 端到端(cards 组)", () => {
  it("cards due 输出 success JSON", async () => {
    const url = await start((req) => {
      if (req.action === "findCards") return { result: [] };
      throw new Error(`unexpected action ${req.action}`);
    });
    const stdout: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await runCli(["cards", "due", "--anki-connect", url]);

    expect(process.exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      success: true,
      total: 0,
    });
  });
});
