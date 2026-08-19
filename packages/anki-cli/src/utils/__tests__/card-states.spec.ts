import { describe, expect, it, vi } from "vitest";
import type { AnkiConnectClient } from "../../client/anki-connect-client";
import { deckScopeQuery, emptyCardStateCounts, fetchCardStateCounts } from "../card-states";

// 测试用桩客户端: invoke 一律返回同一数组。
const stubClient = (
  values: unknown,
): { client: AnkiConnectClient; invoke: ReturnType<typeof vi.fn> } => {
  const invoke = vi.fn(async () => values);
  return { client: { invoke } as unknown as AnkiConnectClient, invoke };
};

describe("deckScopeQuery", () => {
  it("字面转义 Anki 特殊字符(下划线/星号/引号/反斜杠)", () => {
    expect(deckScopeQuery("JLPT_N5")).toBe('"deck:JLPT\\_N5"');
    expect(deckScopeQuery('A"B')).toBe('"deck:A\\"B"');
    expect(deckScopeQuery("A*B")).toBe('"deck:A\\*B"');
    expect(deckScopeQuery("A\\B")).toBe('"deck:A\\\\B"');
  });

  it("冒号不转义(父子牌组名)", () => {
    expect(deckScopeQuery("Parent::Child")).toBe('"deck:Parent::Child"');
  });
});

describe("fetchCardStateCounts", () => {
  it("5 个状态各一次查询并计数", async () => {
    const { client, invoke } = stubClient([1, 2, 3]);

    const counts = await fetchCardStateCounts(client);

    expect(counts).toEqual({
      new: 3,
      learning: 3,
      review: 3,
      suspended: 3,
      buried: 3,
    });
    expect(invoke).toHaveBeenCalledTimes(5);
  });

  it("带 scope 时作为查询前缀", async () => {
    const { client, invoke } = stubClient([]);

    await fetchCardStateCounts(client, '"deck:German"');

    const calls = invoke.mock.calls as [string, { query: string }][];
    expect(calls.every(([, params]) => params.query.startsWith('"deck:German" '))).toBe(true);
  });

  it("非数组响应抛错而不是记 0", async () => {
    const { client } = stubClient("not-an-array");

    await expect(fetchCardStateCounts(client)).rejects.toThrow(/expected array/);
  });
});

describe("emptyCardStateCounts", () => {
  it("全零", () => {
    expect(emptyCardStateCounts()).toEqual({
      new: 0,
      learning: 0,
      review: 0,
      suspended: 0,
      buried: 0,
    });
  });
});
