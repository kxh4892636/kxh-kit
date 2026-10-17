import { describe, expect, it, vi } from "vite-plus/test";
import { ZodError } from "zod";
import { apiCode } from "../../../shared/api.ts";
import type { DailyBarsResponse, Security } from "../../../shared/market.ts";
import { createApp } from "../../app.ts";
import { MarketError } from "../service/errors.ts";
import type { MarketService } from "../service/market-service.ts";

const security: Security = {
  symbol: "932315.CSI",
  name: "中证红利质量",
  assetType: "index",
  exchange: "CSI",
  currency: "CNY",
  source: "hongsehuojian",
  earliestTradeDate: "2013-12-31",
};

const response: DailyBarsResponse = {
  security,
  bars: [],
  meta: {
    cacheStatus: "cache",
    requestedStartDate: "2026-05-01",
    requestedEndDate: "2026-05-29",
    earliestTradeDate: "2013-12-31",
    refreshed: false,
    rows: 0,
  },
};

const createService = (overrides: Partial<MarketService> = {}): MarketService => ({
  listSecurities: (): Security[] => [security],
  getDailyBars: async (): Promise<DailyBarsResponse> => response,
  ...overrides,
});

describe("HTTP 控制层", (): void => {
  it("健康检查、证券与日线成功响应都使用统一结构", async (): Promise<void> => {
    const app = createApp(createService());
    const health = await app.request("/");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      code: apiCode.ok,
      message: "ok",
      extra: {},
      data: { ok: true },
    });
    const securities = await app.request("/api/securities");
    expect(await securities.json()).toEqual({
      code: apiCode.ok,
      message: "ok",
      extra: {},
      data: { securities: [security] },
    });
    const dailyBars = await app.request("/api/daily-bars?symbol=932315.CSI");
    expect(await dailyBars.json()).toEqual({
      code: apiCode.ok,
      message: "ok",
      extra: {},
      data: response,
    });
  });
  it("未知接口返回统一 404", async (): Promise<void> => {
    const result = await createApp(createService()).request("/api/missing");
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({
      code: apiCode.routeNotFound,
      message: "接口不存在",
      extra: { method: "GET", path: "/api/missing" },
      data: null,
    });
  });
  it.each([
    [new ZodError([]), 400, apiCode.invalidArgument],
    [new MarketError("not_found", "证券不存在"), 404, apiCode.notFound],
    [new MarketError("deadline_exceeded", "上游请求超时"), 504, apiCode.deadlineExceeded],
    [new MarketError("upstream_unavailable", "上游行情不可用"), 502, apiCode.upstreamUnavailable],
    [new Error("private details"), 500, apiCode.internal],
  ])("稳定映射错误而不泄漏内部细节 %s", async (error, status, code): Promise<void> => {
    vi.spyOn(console, "error").mockImplementation((): void => {});
    const result = await createApp(
      createService({
        listSecurities: (): Security[] => {
          throw error;
        },
      }),
    ).request("/api/securities");
    expect(result.status).toBe(status);
    expect(await result.json()).toMatchObject({ code, data: null });
  });
  it("拒绝错误日线参数并返回统一错误结构", async (): Promise<void> => {
    const fetcher = vi.fn();
    const result = await createApp(createService({ getDailyBars: fetcher })).request(
      "/api/daily-bars?symbol=932315.CSI&adjType=none",
    );
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({
      code: apiCode.invalidArgument,
      message: "请求参数无效",
      extra: {},
      data: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    "",
    "symbol=",
    "symbol=932315.CSI&adjType=none",
    "symbol=932315.CSI&startDate=2026-02-30",
    "symbol=932315.CSI&endDate=bad",
    "symbol=932315.CSI&startDate=2026-05-30&endDate=2026-05-29",
  ])("拒绝错误日线参数 %s", async (query): Promise<void> => {
    const getDailyBars = vi.fn(async (): Promise<DailyBarsResponse> => response);
    const result = await createApp(createService({ getDailyBars })).request(
      "/api/daily-bars?" + query,
    );
    expect(result.status).toBe(400);
    expect((await result.json()).code).toBe(apiCode.invalidArgument);
    expect(getDailyBars).not.toHaveBeenCalled();
  });
  it("请求取消返回 408 与 canceled 业务码", async (): Promise<void> => {
    const controller = new AbortController();
    controller.abort();
    const result = await createApp(
      createService({
        getDailyBars: async (_input, signal): Promise<DailyBarsResponse> => {
          signal?.throwIfAborted();
          return response;
        },
      }),
    ).request(
      new Request("http://localhost/api/daily-bars?symbol=932315.CSI", {
        signal: controller.signal,
      }),
    );
    expect(result.status).toBe(408);
    expect(await result.json()).toMatchObject({ code: apiCode.canceled, data: null });
  });
});
