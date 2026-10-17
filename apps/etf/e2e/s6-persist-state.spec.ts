import { expect, test } from "@playwright/test";
import { expectDashboardReady, headingLocator, openDashboard } from "./support/dashboard";

const STORAGE_KEY = "etf:dashboard:views:v1";
const symbolInput = (
  page: Parameters<typeof openDashboard>[0],
): ReturnType<typeof page.getByRole> => page.getByRole("combobox");

const selectSymbol = async (
  page: Parameters<typeof openDashboard>[0],
  symbol: string,
): Promise<void> => {
  const input = symbolInput(page);
  await input.click();
  await input.fill(symbol);
  await input.press("Enter");
};

/**
 * E2E-S6: 不同 ETF 的周期/范围/均线/虚拟均线独立保存到 localStorage；
 * 切换恢复、刷新恢复、重置当前 ETF 且不影响其他 ETF。
 */
test("S6 不同 ETF 的筛选状态独立持久化并支持重置", async ({ page }) => {
  await openDashboard(page);
  await expect(headingLocator(page)).toBeVisible();
  await expectDashboardReady(page);
  await expect(page.getByText("红利低波100 · 930955.CSI")).toBeVisible();

  const maInput = page.getByLabel("均线", { exact: true });
  const virtualInput = page.getByLabel("虚拟均线", { exact: true });
  const selectedSegments = page.locator(".ant-segmented-item-selected");

  // A（首个标的）保存自定义状态。
  await page.getByText("周", { exact: true }).click();
  await page.getByText("近一年", { exact: true }).click();
  await maInput.fill("5 8");
  await virtualInput.fill("(MA5 + MA8) / 2");
  await expect
    .poll(() =>
      page.evaluate((key: string): string | null => localStorage.getItem(key), STORAGE_KEY),
    )
    .toContain("(MA5 + MA8) / 2");

  // 切到 B：未保存过，使用默认值。
  await selectSymbol(page, "932315");
  await expect(page.getByText("中证红利质量 · 932315.CSI")).toBeVisible();
  await expect(selectedSegments.filter({ hasText: "日" })).toBeVisible();
  await expect(selectedSegments.filter({ hasText: "全部" })).toBeVisible();
  await expect(maInput).toHaveValue("5 8 13 21 34 55");
  await expect(virtualInput).toHaveValue("");

  // B 保存另一组状态。
  await page.getByText("月", { exact: true }).click();
  await page.getByText("近三年", { exact: true }).click();
  await maInput.fill("5");
  await virtualInput.fill("MA5");
  await expect
    .poll(() =>
      page.evaluate((key: string): string | null => localStorage.getItem(key), STORAGE_KEY),
    )
    .toContain("932315.CSI");

  // 切回 A：恢复 A 的自定义状态。
  await selectSymbol(page, "930955");
  await expect(page.getByText("红利低波100 · 930955.CSI")).toBeVisible();
  await expect(selectedSegments.filter({ hasText: "周" })).toBeVisible();
  await expect(selectedSegments.filter({ hasText: "近一年" })).toBeVisible();
  await expect(maInput).toHaveValue("5 8");
  await expect(virtualInput).toHaveValue("(MA5 + MA8) / 2");

  // 刷新后仍恢复首个标的 A 的状态。
  await page.reload();
  await expectDashboardReady(page);
  await expect(page.getByText("红利低波100 · 930955.CSI")).toBeVisible();
  await expect(selectedSegments.filter({ hasText: "周" })).toBeVisible();
  await expect(maInput).toHaveValue("5 8");

  // 重置 A 为默认值；B 的状态保持独立。
  await page.getByRole("button", { name: "重置" }).click();
  await expect(selectedSegments.filter({ hasText: "日" })).toBeVisible();
  await expect(selectedSegments.filter({ hasText: "全部" })).toBeVisible();
  await expect(maInput).toHaveValue("5 8 13 21 34 55");
  await expect(virtualInput).toHaveValue("");
  await selectSymbol(page, "932315");
  await expect(page.getByText("中证红利质量 · 932315.CSI")).toBeVisible();
  await expect(selectedSegments.filter({ hasText: "月" })).toBeVisible();
  await expect(maInput).toHaveValue("5");
  await expect(virtualInput).toHaveValue("MA5");
});
