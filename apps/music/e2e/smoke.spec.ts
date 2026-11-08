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

test("开启自动播放后，播完自动播下一首", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "播放" }).click();

  const auto = page.getByRole("switch", { name: "自动播放" });
  await expect(auto).toHaveAttribute("aria-checked", "false");
  await auto.click();
  await expect(auto).toHaveAttribute("aria-checked", "true");

  const first = await page.locator("#work").textContent();
  await page.evaluate(() => {
    const audio = document.querySelector("audio");
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, audio.duration - 0.6);
  });

  await expect.poll(() => page.locator("#work").textContent()).not.toBe(first);
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.querySelector("audio")?.currentTime ?? 0))
    .toBeGreaterThan(1);

  await page.reload();
  await expect(page.getByRole("switch", { name: "自动播放" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("播放结束后停在下一首的开头，不自动播放", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "播放" }).click();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();

  const first = await page.locator("#work").textContent();
  await page.evaluate(() => {
    const audio = document.querySelector("audio");
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, audio.duration - 0.6);
  });

  await expect.poll(() => page.locator("#work").textContent()).not.toBe(first);
  await expect(page.getByRole("button", { name: "播放" })).toBeVisible();

  const state = await page.evaluate(() => {
    const audio = document.querySelector("audio");
    return {
      paused: audio?.paused ?? null,
      at: audio?.currentTime ?? -1,
      duration: audio?.duration ?? 0,
    };
  });
  expect(state.paused).toBe(true);
  expect(state.at).toBeLessThan(1);
  expect(state.duration).toBeGreaterThan(1);
});
