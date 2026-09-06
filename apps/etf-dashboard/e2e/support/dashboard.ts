import { expect, type Locator, type Page } from "@playwright/test";

export const HEADING = "ETF K 线看板";
export const ERROR_ALERT = "数据加载失败，请确认 etf-service 已启动";

/** 打开看板首页。 */
export const openDashboard = async (page: Page): Promise<void> => {
  await page.goto("/");
};

export const headingLocator = (page: Page): Locator => page.getByRole("heading", { name: HEADING });

/** 行情加载完成的判据:canvas 可见 + 摘要区已填数(非加载占位 "-")。 */
export const expectDashboardReady = async (page: Page): Promise<void> => {
  await expect(page.locator("canvas")).toBeVisible();
  const latestClose = page.locator("div.rounded.border.bg-white:has-text('最新收盘') div.text-xl");
  await expect(latestClose).toContainText(/\d/);
  await expect(page.getByRole("button", { name: "MA5", exact: true })).toBeVisible();
};
