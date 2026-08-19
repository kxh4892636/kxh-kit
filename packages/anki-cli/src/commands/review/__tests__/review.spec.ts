import { afterEach, describe, expect, it, vi } from "vitest";
import { makeClient } from "../../../test-helpers/make-client";
import {
  startFakeAnkiConnect,
  type FakeAnkiConnect,
  type FakeResponder,
} from "../../../test-fixtures/fake-anki-connect";
import { runReviewSession, type ReviewIo } from "../review-command";

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

// 脚本化 io: 逐行返回预设输入, 收集输出。
const makeIo = (lines: string[]): { io: ReviewIo; out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  const queue = [...lines];
  return {
    io: {
      readLine: async () => queue.shift() ?? null,
      writeOut: (text) => {
        out.push(text);
      },
      writeErr: (text) => {
        err.push(text);
      },
    },
    out,
    err,
  };
};

const parseJsons = (chunks: string[]): Record<string, unknown>[] =>
  chunks.map((c) => JSON.parse(c.trim()) as Record<string, unknown>);

// 会话 responder: sync/due/rate 三阶段
const sessionResponder: FakeResponder = (req) => {
  switch (req.action) {
    case "sync":
      return { result: null };
    case "findCards":
      return { result: [101, 102] };
    case "cardsInfo":
      return {
        result: [
          {
            cardId: 101,
            fields: {},
            fieldOrder: 0,
            question: "Q1",
            answer: 'Q1<hr id="answer">A1',
            modelName: "Basic",
            ord: 0,
            deckName: "D",
            css: "",
            type: 2,
            queue: 2,
            note: 1,
          },
          {
            cardId: 102,
            fields: {},
            fieldOrder: 0,
            question: "Q2",
            answer: 'Q2<hr id="answer">A2',
            modelName: "Basic",
            ord: 0,
            deckName: "D",
            css: "",
            type: 2,
            queue: 2,
            note: 2,
          },
        ],
      };
    case "answerCards":
      return { result: true };
    default:
      throw new Error(`unexpected action ${req.action}`);
  }
};

describe("runReviewSession", () => {
  it("完整会话: sync → 问题 → 评分 → 汇总", async () => {
    const url = await start(sessionResponder);
    const { io, out } = makeIo(["3", "2"]);

    const summary = await runReviewSession(makeClient(url), io, {
      deck: undefined,
      limit: undefined,
      includeNew: false,
      syncFirst: true,
    });

    const jsons = parseJsons(out);
    expect(jsons[0]).toMatchObject({
      success: true,
      message: expect.stringContaining("AnkiWeb") as unknown,
    });
    expect(jsons[1]).toMatchObject({ total: 2, returned: 2 });
    expect(jsons[2]).toMatchObject({ type: "question", cardId: 101, front: "Q1" });
    expect(jsons[3]).toMatchObject({ success: true, rating: 3 });
    expect(jsons[4]).toMatchObject({ type: "question", cardId: 102 });
    expect(jsons[5]).toMatchObject({ success: true, rating: 2 });
    expect(summary).toMatchObject({
      success: true,
      reviewed: 2,
      skipped: 0,
      ratings: { "1": 0, "2": 1, "3": 1, "4": 0 },
    });
  });

  it("非法评分跳过并提示, q 提前退出", async () => {
    const url = await start(sessionResponder);
    const { io, out, err } = makeIo(["x", "q"]);

    const summary = await runReviewSession(makeClient(url), io, {
      deck: undefined,
      limit: undefined,
      includeNew: false,
      syncFirst: false,
    });

    expect(err.length).toBe(1);
    expect(JSON.parse(err[0]!.trim())).toMatchObject({
      success: false,
      error: expect.stringContaining("1-4") as unknown,
    });
    expect(summary).toMatchObject({ reviewed: 0, skipped: 1 });
    // 无 sync 输出(第一个 JSON 是 due 头)
    expect(JSON.parse(out[0]!.trim())).toMatchObject({ total: 2 });
  });

  it("--no-sync: 不发起 sync 请求", async () => {
    const syncSpy: string[] = [];
    const url = await start((req) => {
      if (req.action === "sync") {
        syncSpy.push("sync");
        return { result: null };
      }
      if (req.action === "findCards") return { result: [] };
      throw new Error(`unexpected action ${req.action}`);
    });
    const { io } = makeIo([]);

    await runReviewSession(makeClient(url), io, {
      deck: undefined,
      limit: undefined,
      includeNew: false,
      syncFirst: false,
    });

    expect(syncSpy).toHaveLength(0);
  });

  it("无到期卡片: 直接汇总", async () => {
    const url = await start((req) => {
      if (req.action === "sync") return { result: null };
      if (req.action === "findCards") return { result: [] };
      throw new Error(`unexpected action ${req.action}`);
    });
    const { io, out } = makeIo([]);

    const summary = await runReviewSession(makeClient(url), io, {
      deck: undefined,
      limit: undefined,
      includeNew: false,
      syncFirst: true,
    });

    expect(summary).toMatchObject({ success: true, reviewed: 0, skipped: 0 });
    expect(JSON.parse(out[1]!.trim())).toMatchObject({ total: 0 });
  });
});
