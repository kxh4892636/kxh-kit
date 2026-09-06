import { expect, it, vi } from "vitest";
import { parseKline } from "./kline-response.ts";
import { createRemoteFetcher } from "./hongsehuojian.ts";
const payload = { columns: "tradeDate,open,high,low,close", items: "2013-12-31,100,101,99,100.5" };
it("解析顶层/嵌套响应，排序并填充可选字段", (): void => {
  const first = parseKline(payload, "932315.CSI", "qfq")[0];
  expect(first).toMatchObject({
    tradeDate: "2013-12-31",
    volume: 0,
    amount: 0,
    changeAmount: 0.5,
    changePercent: 0.5,
  });
  const bars = parseKline(
    {
      data: {
        securityCode: "932315.CSI",
        columns: "week,tradeDate,open,high,low,close,volume,amount,change,changePercent",
        items: "二,2014-01-02,101,103,100,102,,,,;一,2013-12-31,100,101,99,100.5,10,1000,0.5,0.5",
      },
    },
    "932315.CSI",
    "qfq",
  );
  expect(bars.map((bar): string => bar.tradeDate)).toEqual(["2013-12-31", "2014-01-02"]);
  expect(bars[1]).toMatchObject({ volume: 0, changeAmount: 1, rawWeekday: "二" });
  expect(
    parseKline({ ...payload, items: "2013-12-31,0,1,0,1" }, "932315.CSI", "qfq")[0].changePercent,
  ).toBe(0);
});
it.each([
  null,
  { ...payload, securityCode: "other" },
  { ...payload, columns: "open" },
  { ...payload, items: "" },
  { ...payload, items: "2013-12-31,1" },
  { ...payload, items: "2013-02-30,1,2,0,1" },
  { ...payload, items: "2013-12-31,NaN,2,0,1" },
  { ...payload, items: "2013-12-31,1,0,2,1" },
  { ...payload, items: "2013-12-31,1,2,0,Infinity" },
  { ...payload, columns: payload.columns + ",volume", items: payload.items + ",-1" },
  { ...payload, columns: payload.columns + ",change", items: payload.items + ",bad" },
])("拒绝不可信响应 %j", (input): void => {
  expect(() => parseKline(input, "932315.CSI", "qfq")).toThrow();
});
it("发送红色火箭协议参数并解析响应", async (): Promise<void> => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
  const fetcher = createRemoteFetcher({
    fetch: request,
    now: (): Date => new Date("2026-05-29T16:00:00Z"),
  });
  expect(await fetcher("932315.CSI", "qfq")).toHaveLength(1);
  const url = request.mock.calls[0][0] as URL;
  expect(Object.fromEntries(url.searchParams)).toEqual({
    securityCode: "932315.CSI",
    period: "day",
    count: "-1000",
    begin: "20260530",
    adjust: "1",
    ts: "1780070400000",
  });
  expect(request.mock.calls[0][1]?.headers).toEqual({ accept: "application/json" });
});
it.each([
  (): Response => new Response("fail", { status: 500 }),
  (): Response => new Response("bad json"),
  (): Response => new Response(null),
  (): Response => new Response("x".repeat(8 * 1024 * 1024 + 1)),
  (): Response => Response.json({ ...payload, items: "" }),
])("HTTP/JSON/空响应/大小上限映射为上游不可用", async (response): Promise<void> => {
  const fetcher = createRemoteFetcher({
    fetch: vi.fn<typeof fetch>().mockResolvedValue(response()),
  });
  await expect(fetcher("932315.CSI", "qfq")).rejects.toMatchObject({
    status: 502,
    code: "upstream_unavailable",
  });
});
it("不支持的复权或 endpoint 协议拒绝请求", async (): Promise<void> => {
  await expect(createRemoteFetcher()("x", "none")).rejects.toMatchObject({ status: 502 });
  await expect(createRemoteFetcher({ endpoint: "file:///x" })("x", "qfq")).rejects.toMatchObject({
    status: 502,
  });
});
it("上游 timeout 与调用方取消保持不同语义", async (): Promise<void> => {
  const waiting: typeof fetch = async (_input, options): Promise<Response> =>
    new Promise((_resolve, reject): void => {
      options?.signal?.addEventListener("abort", (): void => reject(options.signal?.reason), {
        once: true,
      });
    });
  await expect(
    createRemoteFetcher({ fetch: waiting, timeoutMs: 5 })("x", "qfq"),
  ).rejects.toMatchObject({ status: 504 });
  const controller = new AbortController();
  const promise = createRemoteFetcher({ fetch: waiting })("x", "qfq", controller.signal);
  controller.abort(new Error("caller canceled"));
  await expect(promise).rejects.toThrow("caller canceled");
  await expect(createRemoteFetcher()("x", "qfq", controller.signal)).rejects.toThrow(
    "caller canceled",
  );
});
it("网络失败映射为可观察上游错误", async (): Promise<void> => {
  await expect(
    createRemoteFetcher({ fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error("network")) })(
      "x",
      "qfq",
    ),
  ).rejects.toMatchObject({ status: 502 });
});
