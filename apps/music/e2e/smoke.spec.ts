import { expect, test, type Page } from "@playwright/test";

/** Lets a test jump the wall clock forward: only Date.now() moves, audio timing does not. */
const installClock = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const realNow = Date.now.bind(Date);
    let offset = 0;
    Date.now = () => realNow() + offset;
    (window as unknown as { __musicAdvance: (ms: number) => void }).__musicAdvance = (ms) => {
      offset += ms;
    };
  });
};

const advance = async (page: Page, ms: number): Promise<void> => {
  await page.evaluate((value) => {
    (window as unknown as { __musicAdvance: (ms: number) => void }).__musicAdvance(value);
  }, ms);
};

const jumpToEnd = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const audio = document.querySelector("audio");
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, audio.duration - 0.6);
  });
};

const openTimer = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "定时" }).click();
  await expect(page.getByLabel("自动播放分钟数")).toBeFocused();
};

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
  // The timer is session state: a reload goes back to「定时」.
  await expect(page.getByRole("button", { name: "定时" })).toBeVisible();
});

test("播放结束后停在下一首的开头，不自动播放", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "播放" }).click();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();

  const first = await page.locator("#work").textContent();
  await jumpToEnd(page);

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

test("定时面板：快选只填数字，开始后显示读数且不可点", async ({ page }) => {
  await page.goto("/");
  await openTimer(page);

  await page.getByRole("button", { name: "设为 15 分钟" }).click();
  await expect(page.getByLabel("自动播放分钟数")).toHaveValue("15");
  await page.getByLabel("自动播放分钟数").fill("7");
  await page.getByRole("button", { name: "开始计时" }).click();

  await expect(page.getByRole("timer")).toHaveCount(1);
  await expect(page.getByRole("timer")).toContainText("07:00");
  await expect(page.getByRole("button", { name: "定时" })).toHaveCount(0);
});

test("定时面板：非法分钟数当场报错", async ({ page }) => {
  await page.goto("/");
  await openTimer(page);

  await page.getByLabel("自动播放分钟数").fill("0");
  await page.getByRole("button", { name: "开始计时" }).click();

  await expect(page.getByText("只能是 1 到 1440 之间的整数。")).toBeVisible();
  await expect(page.getByLabel("自动播放分钟数")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("timer")).toHaveCount(0);
});

test("计时开始时音乐从暂停转为播放", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "播放" })).toBeVisible();

  await openTimer(page);
  await page.getByLabel("自动播放分钟数").fill("1");
  await page.getByRole("button", { name: "开始计时" }).click();

  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.querySelector("audio")?.currentTime ?? 0))
    .toBeGreaterThan(0.3);
});

test("倒计时内：播完自动播下一首", async ({ page }) => {
  await installClock(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "定时" })).toBeVisible();
  await page.getByRole("button", { name: "播放" }).click();

  await openTimer(page);
  await page.getByLabel("自动播放分钟数").fill("1");
  await page.getByRole("button", { name: "开始计时" }).click();
  await advance(page, 20_000);

  const first = await page.locator("#work").textContent();
  await jumpToEnd(page);

  await expect.poll(() => page.locator("#work").textContent()).not.toBe(first);
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.querySelector("audio")?.currentTime ?? 0))
    .toBeGreaterThan(0);
});

test("到期后：本轮播完停在下一首，读数回到「定时」", async ({ page }) => {
  await installClock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "播放" }).click();

  await openTimer(page);
  await page.getByLabel("自动播放分钟数").fill("1");
  await page.getByRole("button", { name: "开始计时" }).click();
  await expect(page.getByRole("timer")).toContainText("01:00");

  await advance(page, 61_000);
  await expect(page.getByRole("button", { name: "定时" })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveCount(0);

  const first = await page.locator("#work").textContent();
  await jumpToEnd(page);
  await expect.poll(() => page.locator("#work").textContent()).not.toBe(first);
  await expect(page.getByRole("button", { name: "播放" })).toBeVisible();
  expect(await page.evaluate(() => document.querySelector("audio")?.paused ?? null)).toBe(true);
});

test("不限时：从暂停开始播，一直连播，刷新后回到「定时」", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "播放" })).toBeVisible();

  await openTimer(page);
  await page.getByRole("button", { name: "不限时" }).click();
  const readout = page.getByRole("timer");
  await expect(readout).toContainText("不限时");
  await expect(page.getByRole("button", { name: "定时" })).toHaveCount(0);
  // 不限时 also starts the music.
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();

  const first = await page.locator("#work").textContent();
  await jumpToEnd(page);
  await expect.poll(() => page.locator("#work").textContent()).not.toBe(first);
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "定时" })).toBeVisible();
});
