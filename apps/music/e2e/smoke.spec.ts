import { expect, test } from "@playwright/test";

test("播放、下一首与历史", async ({ page }) => {
  await page.goto("/");
  const play = page.getByRole("button", { name: "播放" });
  await expect(play).toBeEnabled();

  await expect(page.locator("#work")).not.toBeEmpty();
  await play.click();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();

  const audio = page.locator("audio");
  await expect
    .poll(async () => page.evaluate(() => document.querySelector("audio")?.currentTime ?? 0))
    .toBeGreaterThan(1);

  const first = await page.locator("#work").textContent();
  await page.getByRole("button", { name: "下一首" }).click();
  await expect(page.locator(".history__item")).toHaveCount(2);
  await expect(page.locator("#work")).not.toHaveText(first ?? "");

  const wave = page.locator(".wave");
  const box = await wave.boundingBox();
  if (!box) throw new Error("波形没有渲染");
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const element = document.querySelector("audio");
        if (!element || !element.duration) return 0;
        return element.currentTime / element.duration;
      }),
    )
    .toBeGreaterThan(0.4);

  await page.reload();
  await expect(page.locator(".history__item")).toHaveCount(2);
  await expect(audio).toHaveCount(1);
});
