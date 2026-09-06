import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FC, ReactElement, ReactNode } from "react";
import { render, type RenderResult } from "vitest-browser-react";
import type { DailyBar, Security } from "../libs/api/client";

import { normalizeBars, type ChartBar } from "../features/market-dashboard/chart/chart-data";

import { ApiContext, createEtfClient, type EtfClient } from "../libs/api/client";

const formatDateMs = (dateMs: number): string => {
  const date = new Date(dateMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface FixtureBarOptions {
  startDate?: string;
  symbol?: string;
  /** 收盘价生成函数，默认线性上涨（10 + index * 0.1），便于手算 MA 特征值。 */
  closeForIndex?: (index: number) => number;
}

/** 生成确定性的日线数据：open = close - 0.2，high/low 对称外扩，量随序号递增。 */
export const makeDailyBars = (count: number, options?: FixtureBarOptions): DailyBar[] => {
  const startMs = Date.parse(`${options?.startDate ?? "2024-01-02"}T00:00:00Z`);
  const symbol = options?.symbol ?? "510300";
  const closeForIndex = options?.closeForIndex ?? ((index: number): number => 10 + index * 0.1);
  const bars: DailyBar[] = [];
  for (let index = 0; index < count; index += 1) {
    const close = Number(closeForIndex(index).toFixed(4));
    const open = Number((close - 0.2).toFixed(4));
    const volume = 10_000 * (index + 1);
    bars.push({
      symbol,
      adjType: "qfq",
      tradeDate: formatDateMs(startMs + index * 86_400_000),
      open,
      high: Number((close + 0.1).toFixed(4)),
      low: Number((open - 0.1).toFixed(4)),
      close,
      volume,
      amount: volume * close,
      changeAmount: 0.2,
      changePercent: (0.2 / open) * 100,
      rawWeekday: "",
    });
  }
  return bars;
};

/** 生成与日线一一对应的 ChartBar（normalizeBars 保持引用，便于 useMaSeries 的引用匹配路径）。 */
export const makeChartBars = (count: number, options?: FixtureBarOptions): ChartBar[] =>
  normalizeBars(makeDailyBars(count, options));

export const makeSecurity = (overrides?: Partial<Security>): Security => ({
  symbol: "510300",
  name: "沪深300ETF",
  assetType: "etf",
  exchange: "SH",
  currency: "CNY",
  source: "fixture",
  earliestTradeDate: "2024-01-02",
  latestCachedTradeDate: "2024-03-01",
  ...overrides,
});

interface MockEtfHandlers {
  securities?: Security[];
  listError?: Error;
  security?: Security | undefined;
  bars?: DailyBar[];
  barsError?: Error;
}

/** 在 HTTP 客户端边界返回受控响应，保留真实查询与错误处理。 */
export const createTestClient = (handlers: MockEtfHandlers): EtfClient =>
  createEtfClient("http://fixture", async (input): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.includes("/api/securities")) {
      if (handlers.listError)
        return Response.json({ error: { code: "unavailable" } }, { status: 503 });
      return Response.json({ securities: handlers.securities ?? [] });
    }
    if (handlers.barsError)
      return Response.json({ error: { code: "unavailable" } }, { status: 503 });
    const security = handlers.security ?? makeSecurity(),
      bars = handlers.bars ?? [];
    return Response.json({
      security,
      bars,
      meta: {
        cacheStatus: "cache",
        earliestTradeDate: security.earliestTradeDate,
        latestCachedTradeDate: security.latestCachedTradeDate,
        requestedStartDate: security.earliestTradeDate,
        requestedEndDate: "2024-03-01",
        refreshed: false,
        rows: bars.length,
      },
    });
  });
/** 服务端不可用的固定错误，用于错误态测试。 */
export const unavailableError = (): Error => new Error("service unavailable");

const createTestQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

/** 与 app providers 一致的最小组合（不含 router）：ApiContext.Provider + 每测一新的 QueryClient。 */
export const renderWithProviders = (
  ui: ReactElement,
  transport: EtfClient,
): Promise<RenderResult> => {
  const Wrapper: FC<{ children: ReactNode }> = (props: { children: ReactNode }): ReactElement => (
    <ApiContext.Provider value={transport}>
      <QueryClientProvider client={createTestQueryClient()}>{props.children}</QueryClientProvider>
    </ApiContext.Provider>
  );
  return render(ui, { wrapper: Wrapper });
};

/** 密集抽样 canvas 像素，返回非白色计数 + 简单哈希，用于断言渲染结果是否变化。 */
export const getCanvasSignature = (canvas: HTMLCanvasElement): string => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return "no-ctx";
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let nonWhite = 0;
  let hash = 5381;
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const index = (y * width + x) * 4;
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (r < 245 || g < 245 || b < 245) nonWhite += 1;
      hash = ((hash << 5) + hash + r * 3 + g * 5 + b * 7 + (data[index + 3] ?? 0)) | 0;
    }
  }
  return `${nonWhite}:${hash}`;
};

/** 统计 canvas 中精确等于指定 RGB 的像素数（MA 线颜色唯一，可精确断言某条均线是否绘制）。 */
export const countColorPixels = (
  canvas: HTMLCanvasElement,
  color: readonly [number, number, number],
): number => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (
      data[index] === color[0] &&
      data[index + 1] === color[1] &&
      data[index + 2] === color[2] &&
      data[index + 3] === 255
    ) {
      count += 1;
    }
  }
  return count;
};

/** MA 图例/均线的确定性颜色（对齐 chart-data 的 MA_COLORS 顺序）。 */
export const MA5_RGB = [35, 95, 214] as const;
export const MA20_RGB = [213, 138, 31] as const;
export const UP_CANDLE_RGB = [213, 73, 73] as const;
/** 虚拟均线虚线颜色（对齐 chart-data 的 VIRTUAL_MA_COLOR）。 */
export const VIRTUAL_MA_RGB = [234, 179, 8] as const;
