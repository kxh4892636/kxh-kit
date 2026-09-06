import { describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { GetDailyBarsResponse } from "../../libs/api/client";
import { KlineTooltip } from "./chart/kline-tooltip";
import { MaLegend } from "./chart/ma-legend";
import { MarketSummary } from "./market-summary";
import { makeChartBars, makeDailyBars, makeSecurity } from "../../test-support/render";

describe("MarketSummary", () => {
  test("上涨数据渲染格式化数值与涨色", { timeout: 15_000 }, async () => {
    const data: GetDailyBarsResponse = {
      security: makeSecurity(),
      meta: {
        cacheStatus: "cache",
        requestedStartDate: "2024-01-02",
        requestedEndDate: "2024-03-01",
        earliestTradeDate: "2024-01-02",
        refreshed: false,
        rows: 40,
      },
      bars: makeDailyBars(40),
    };
    const { container } = await render(<MarketSummary data={data} />);

    const text = container.textContent ?? "";
    expect(text).toContain("最新收盘");
    expect(text).toContain("13.9");
    expect(text).toContain("数据范围");
    expect(text).toContain("2024-01-02 至 2024-03-01");
    const trend = container.querySelector(".text-red-600");
    expect(trend).not.toBeNull();
    expect(trend?.textContent).toContain("%");
  });

  test("下跌数据渲染跌色", { timeout: 15_000 }, async () => {
    const [bar] = makeDailyBars(1);
    const data: GetDailyBarsResponse = {
      security: makeSecurity(),
      meta: {
        cacheStatus: "cache",
        requestedStartDate: "2024-01-02",
        requestedEndDate: "2024-03-01",
        earliestTradeDate: "2024-01-02",
        refreshed: false,
        rows: 40,
      },
      bars: [{ ...bar!, changePercent: -2.5, changeAmount: -0.3 }],
    };
    const { container } = await render(<MarketSummary data={data} />);

    const trend = container.querySelector(".text-emerald-600");
    expect(trend).not.toBeNull();
    expect(trend?.textContent).toContain("-2.5%");
  });
});

describe("MaLegend", () => {
  const series = [
    { period: 5, color: "#235fd6", values: [] },
    { period: 20, color: "#d58a1f", values: [] },
  ];

  test("渲染 MA 图例按钮，点击触发 onToggle", { timeout: 15_000 }, async () => {
    const onToggle = vi.fn<(period: number) => void>();
    await render(<MaLegend series={series} hiddenPeriods={new Set()} onToggle={onToggle} />);

    await expect.element(page.getByRole("button", { name: "MA5" })).toBeVisible();
    await page.getByRole("button", { name: "MA20" }).click();
    expect(onToggle).toHaveBeenCalledWith(20);
  });

  test("隐藏周期按钮展示置灰样式", { timeout: 15_000 }, async () => {
    const { container } = await render(
      <MaLegend series={series} hiddenPeriods={new Set([20])} onToggle={vi.fn()} />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    const ma5 = buttons.find(
      (button: HTMLButtonElement): boolean => button.textContent?.includes("MA5") ?? false,
    );
    const ma20 = buttons.find(
      (button: HTMLButtonElement): boolean => button.textContent?.includes("MA20") ?? false,
    );
    expect(ma5?.className).not.toContain("text-slate-400");
    expect(ma20?.className).toContain("text-slate-400");
  });
});

describe("KlineTooltip", () => {
  test("渲染 OHLC/涨跌额/MA 行与涨色", { timeout: 15_000 }, async () => {
    const [record] = makeChartBars(1);
    const { container } = await render(
      <KlineTooltip
        record={record!}
        maValues={[{ label: "MA5", value: 12.5, color: "#235fd6" }]}
        virtualMaValue={null}
        left={10}
        top={20}
      />,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("2024-01-02");
    expect(text).toContain("开盘");
    expect(text).toContain("9.8");
    expect(text).toContain("收盘");
    expect(text).toContain("涨跌额");
    expect(text).toContain("+0.2");
    expect(text).toContain("MA5");
    expect(text).toContain("12.5");
    expect(container.querySelector(".text-red-600")).not.toBeNull();
  });

  test("下跌记录渲染跌色且涨跌额不带正号", { timeout: 15_000 }, async () => {
    const [record] = makeChartBars(1);
    const { container } = await render(
      <KlineTooltip
        record={{ ...record!, changeAmount: -0.35, changePercent: -3.5 }}
        maValues={[]}
        virtualMaValue={null}
        left={10}
        top={20}
      />,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("-0.35");
    expect(text).not.toContain("+-");
    expect(container.querySelector(".text-emerald-600")).not.toBeNull();
  });
});
