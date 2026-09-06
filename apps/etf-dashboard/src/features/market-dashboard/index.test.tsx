import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import {
  createTestClient,
  makeDailyBars,
  makeSecurity,
  renderWithProviders,
  unavailableError,
} from "../../test-support/render";
import { MarketDashboard } from "./index";
import { createEtfClient } from "../../libs/api/client";

const bodyText = (): string => document.body.textContent ?? "";

describe("MarketDashboard", () => {
  test.each([{}, { securities: [null, {}, makeSecurity()] }])(
    "成功响应缺少列表字段或包含空成员时保留页面：%j",
    async (list) => {
      let requests = 0;
      const client = createEtfClient("http://fixture", async (): Promise<Response> => {
        requests += 1;
        return Response.json(requests === 1 ? list : {});
      });
      await renderWithProviders(<MarketDashboard />, client);
      await expect.poll(() => requests).toBeGreaterThan(0);
      if ("securities" in list) {
        await expect.poll(() => requests).toBe(2);
        await expect.poll(bodyText).toContain("沪深300ETF · 510300");
      }
      await expect.poll(bodyText).toContain("最新收盘");
    },
  );
  test("日线空成员和缺日期成员被忽略，有效行情仍可绘制", async () => {
    const client = createEtfClient(
      "http://fixture",
      async (input): Promise<Response> =>
        Response.json(
          (input instanceof Request ? input.url : input.toString()).includes("securities")
            ? { securities: [makeSecurity()] }
            : { bars: [null, {}, ...makeDailyBars(40)], security: null, meta: null },
        ),
    );
    await renderWithProviders(<MarketDashboard />, client);
    await expect.element(page.getByRole("button", { name: "MA5", exact: true })).toBeVisible();
    expect(bodyText()).toContain("最新收盘");
    expect(document.querySelector("canvas")).not.toBeNull();
  });
  test("服务不可用时展示错误提示且保留应用壳", { timeout: 20_000 }, async () => {
    const transport = createTestClient({
      listError: unavailableError(),
      barsError: unavailableError(),
    });
    await renderWithProviders(<MarketDashboard />, transport);

    await expect
      .poll(bodyText, { timeout: 15_000 })
      .toContain("数据加载失败，请确认 etf-service 已启动");
    expect(bodyText()).toContain("ETF K 线看板");
  });

  test("成功加载后自动选中第一个标的并展示摘要与图例", { timeout: 20_000 }, async () => {
    const securities = [makeSecurity(), makeSecurity({ symbol: "510500", name: "上证50ETF" })];
    const transport = createTestClient({
      securities,
      security: securities[0],
      bars: makeDailyBars(40),
    });
    await renderWithProviders(<MarketDashboard />, transport);

    await expect.poll(bodyText, { timeout: 15_000 }).toContain("沪深300ETF · 510300");
    expect(bodyText()).toContain("最新收盘");
    expect(bodyText()).toContain("cache · 40 条");
    await expect.element(page.getByRole("button", { name: "MA5", exact: true })).toBeVisible();
    expect(document.querySelector("canvas")).not.toBeNull();
  });
});
