import { expect, test } from "@playwright/test";
import { expectDashboardReady, headingLocator, openDashboard } from "./support/dashboard";

/**
 * E2E-S3:用户在窄屏(390 x 844)下使用看板,页面不得横向溢出。
 * 对应 index.md 的 E2E-S3。
 */
test.use({ viewport: { width: 390, height: 844 } });

test("S3 用户在窄屏下使用看板", async ({ page }) => {
  await openDashboard(page);
  await expect(headingLocator(page)).toBeVisible();
  await expectDashboardReady(page);

  const layout = await page.evaluate((): { innerWidth: number; scrollWidth: number } => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.body.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);

  // 关键控件在窄屏下仍可见。
  await expect(page.locator(".ant-select")).toBeVisible();
  await expect(page.getByText("周", { exact: true })).toBeVisible();
  await expect(page.getByText("近一年", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新" })).toBeVisible();
  await expect(page.getByRole("button", { name: "MA5", exact: true })).toBeVisible();

  await page.screenshot({ path: "e2e/evidence/s3-mobile.png", fullPage: true });
});
