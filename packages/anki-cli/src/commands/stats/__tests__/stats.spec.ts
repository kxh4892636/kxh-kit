import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../../../cli/run";
import { makeClient } from "../../../test-helpers/make-client";
import {
  startFakeAnkiConnect,
  type FakeAnkiConnect,
  type FakeResponder,
} from "../../../test-fixtures/fake-anki-connect";
import { runCollectionStats } from "../collection-command";
import { reviewStatsParamsSchema, runReviewStats } from "../review-command";

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

const todayIso = (): string => new Date().toISOString().split("T")[0]!;

describe("runCollectionStats", () => {
  const responder: FakeResponder = (req) => {
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
        if (query.includes("is:new")) return { result: [1] };
        if (query.includes("is:")) return { result: [] };
        return { result: [1, 2, 3] };
      }
      case "getEaseFactors":
        return { result: [2100, 2500, 3000] };
      case "getIntervals":
        return { result: [7, 100] };
      default:
        throw new Error(`unexpected action ${req.action}`);
    }
  };

  it("counts 只对根牌组求和, per_deck 上卷 total", async () => {
    const url = await start(responder);

    const result = await runCollectionStats(makeClient(url), {});

    expect(result.total_decks).toBe(2);
    expect(result.counts).toEqual({ total: 15, new: 2, learning: 1, review: 3, other: 9 });
    expect(result.per_deck).toEqual([
      { deck: "German", total: 15, new: 2, learning: 1, review: 3, other: 9 },
      { deck: "German::Verbs", total: 5, new: 1, learning: 0, review: 2, other: 2 },
    ]);
    expect(result.states.new).toBe(1);
    expect(result.ease.count).toBe(3);
    expect(result.intervals.count).toBe(2);
  });

  it("无牌组集合返回零结构", async () => {
    const url = await start((req) => {
      if (req.action === "deckNamesAndIds") return { result: {} };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runCollectionStats(makeClient(url), {});

    expect(result).toMatchObject({
      total_decks: 0,
      counts: { total: 0, new: 0, learning: 0, review: 0, other: 0 },
      per_deck: [],
    });
  });
});

describe("runReviewStats", () => {
  it("全集合路径聚合(deck 缺省)", async () => {
    const day0 = new Date();
    const reviewId = day0.getTime();
    const url = await start((req) => {
      if (req.action === "findCards") return { result: [1] };
      if (req.action === "getReviewsOfCards")
        return {
          result: {
            "1": [
              {
                id: reviewId,
                usn: -1,
                ease: 3,
                ivl: 5,
                lastIvl: 0,
                factor: 2500,
                time: 1000,
                type: 1,
              },
            ],
          },
        };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runReviewStats(makeClient(url), { startDate: todayIso() });

    expect(result.deck).toBe("All Decks");
    expect(result.summary.total_reviews).toBe(1);
    expect(result.reviews_by_day[0]).toEqual({ date: todayIso(), count: 1 });
    expect(result.retention.by_rating.good).toBe(1);
  });

  it("日期范围非法拒绝(schema 校验)", async () => {
    expect(() =>
      reviewStatsParamsSchema.parse({
        startDate: "2026-01-02",
        endDate: "2026-01-01",
      }),
    ).toThrow(/less than or equal/);
  });
});

describe("CLI 端到端(stats 组)", () => {
  it("stats collection 输出 success JSON(空集合)", async () => {
    const url = await start((req) => {
      if (req.action === "deckNamesAndIds") return { result: {} };
      throw new Error(`unexpected action ${req.action}`);
    });
    const stdout: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await runCli(["stats", "collection", "--anki-connect", url]);

    expect(process.exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ total_decks: 0 });
  });

  it("stats review 缺 --start: 用法错误退出码 2", async () => {
    const url = await start(() => ({ result: null }));
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    await runCli(["stats", "review", "--anki-connect", url]);

    expect(process.exitCode).toBe(2);
  });
});
