import { expect, test } from "@playwright/test";
import {
  ERROR_ALERT,
  expectDashboardReady,
  headingLocator,
  openDashboard,
} from "./support/dashboard";

/**
 * E2E-S5:用户输入虚拟均线表达式后,图上绘制虚线并在 tooltip 中显示虚拟均线行。
 * 细粒度断言(虚线像素、图例显隐、非法输入)已由组件层覆盖,这里只验证消费者旅程联通。
 */
test("S5 用户输入虚拟均线表达式后看到虚线与 tooltip 数值", async ({ page }) => {
  await openDashboard(page);
  await expect(headingLocator(page)).toBeVisible();
  await expectDashboardReady(page);

  const virtualInput = page.getByPlaceholder("如 (MA5 + MA8) / 2");
  await virtualInput.fill("(MA5 + MA8) / 2");
  await expect(page.getByRole("button", { name: "虚拟" })).toBeVisible();

  // hover 画布中部,tooltip 应出现"虚拟均线"行。
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas 不可见");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
  const tooltip = page.locator(".pointer-events-none");
  await expect(tooltip.getByText("虚拟均线")).toBeVisible();
  await expect(page.getByText(ERROR_ALERT)).toHaveCount(0);

  await page.screenshot({ path: "e2e/evidence/s5-virtual-ma.png", fullPage: true });
});
