import { expect, test } from "@playwright/test";
import { expectDashboardReady, headingLocator, openDashboard } from "./support/dashboard";

/**
 * E2E-S1:用户打开看板并看到默认行情。
 * 对应 apps/dashboard/src/features/market-dashboard/e2e/index.md 的 E2E-S1。
 */
test("S1 用户打开看板并看到默认行情", async ({ page }) => {
  await openDashboard(page);

  await expect(page).toHaveTitle("ETF Dashboard");
  await expect(headingLocator(page)).toBeVisible();
  await expect(page.getByText("红利低波100 · 930955.CSI")).toBeVisible();

  // 摘要区、K 线图与默认 MA 图例。
  await expect(page.getByText("最新收盘")).toBeVisible();
  await expect(page.getByText("涨跌幅")).toBeVisible();
  await expect(page.getByText("数据范围")).toBeVisible();
  await expectDashboardReady(page);
  await expect(page.getByRole("button", { name: "MA8", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "MA55", exact: true })).toBeVisible();

  await page.screenshot({ path: "e2e/evidence/s1-default.png", fullPage: true });
});
