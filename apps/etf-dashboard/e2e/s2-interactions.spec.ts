import { expect, test } from "@playwright/test";
import {
  ERROR_ALERT,
  expectDashboardReady,
  headingLocator,
  openDashboard,
} from "./support/dashboard";

/**
 * E2E-S2:用户完成看板核心交互(切标的、切周期、切范围、刷新)。
 * 对应 index.md 的 E2E-S2;细粒度交互(tooltip/缩放/拖拽)已由组件层覆盖,这里只验证联通性。
 */
test("S2 用户完成看板核心交互", async ({ page }) => {
  await openDashboard(page);
  await expect(headingLocator(page)).toBeVisible();
  await expectDashboardReady(page);

  // 切换标的到 932315.CSI:用搜索输入过滤后回车选中,避免下拉项 hover 重渲染导致的 DOM detach。
  const symbolInput = page.getByRole("combobox");
  await symbolInput.click();
  await symbolInput.fill("932315");
  await symbolInput.press("Enter");
  await expect(page.getByText("中证红利质量 · 932315.CSI")).toBeVisible();

  // 切周期"周"、范围"近一年"。
  await page.getByText("周", { exact: true }).click();
  await page.getByText("近一年", { exact: true }).click();
  await expect(page.locator(".ant-segmented-item-selected", { hasText: "周" })).toBeVisible();
  await expect(page.locator(".ant-segmented-item-selected", { hasText: "近一年" })).toBeVisible();

  // 点刷新后图表保持可见,且不出现服务不可用错误。
  await page.getByRole("button", { name: "刷新" }).click();
  await expectDashboardReady(page);
  await expect(page.getByText(ERROR_ALERT)).toHaveCount(0);

  await page.screenshot({ path: "e2e/evidence/s2-interactions.png", fullPage: true });
});
