import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { KlineChart } from "./kline-chart";
import {
  countColorPixels,
  getCanvasSignature,
  makeChartBars,
  MA20_RGB,
  MA5_RGB,
  UP_CANDLE_RGB,
  VIRTUAL_MA_RGB,
} from "../../../test-support/render";

const BARS = makeChartBars(60);

const getCanvas = (): HTMLCanvasElement => {
  const canvas = document.querySelector("canvas");
  if (!canvas) throw new Error("canvas 不存在");
  return canvas;
};

const plotClientPoint = (
  canvas: HTMLCanvasElement,
  xRatio: number,
  yRatio: number,
): { clientX: number; clientY: number } => {
  const rect = canvas.getBoundingClientRect();
  return {
    clientX: rect.left + rect.width * xRatio,
    clientY: rect.top + rect.height * yRatio,
  };
};

const mouseMove = (canvas: HTMLCanvasElement, xRatio: number, yRatio: number): void => {
  const point = plotClientPoint(canvas, xRatio, yRatio);
  canvas.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, ...point }));
};

const wheelZoomIn = (canvas: HTMLCanvasElement): void => {
  const point = plotClientPoint(canvas, 0.5, 0.4);
  canvas.dispatchEvent(
    new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -120, ...point }),
  );
};

const readTooltipText = (): string =>
  document.querySelector(".pointer-events-none")?.textContent ?? "";

const readTooltipDate = (): string | null =>
  readTooltipText().match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;

describe("KlineChart", () => {
  test("canvas 渲染非空白，MA 图例展示 MA5/MA20", { timeout: 15_000 }, async () => {
    await render(<KlineChart bars={BARS} maBars={BARS} maText="5 20" />);

    const canvas = getCanvas();
    await expect.poll((): number => countColorPixels(canvas, UP_CANDLE_RGB)).toBeGreaterThan(0);
    expect(countColorPixels(canvas, MA5_RGB)).toBeGreaterThan(0);
    expect(countColorPixels(canvas, MA20_RGB)).toBeGreaterThan(0);
    await expect.element(page.getByRole("button", { name: "MA5" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "MA20" })).toBeVisible();
  });

  test("点击 MA20 图例隐藏/恢复 MA20 均线", { timeout: 15_000 }, async () => {
    await render(<KlineChart bars={BARS} maBars={BARS} maText="5 20" />);
    const canvas = getCanvas();
    await expect.poll((): number => countColorPixels(canvas, MA20_RGB)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "MA20" }).click();
    await expect.poll((): number => countColorPixels(canvas, MA20_RGB)).toBe(0);
    expect(countColorPixels(canvas, MA5_RGB)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "MA20" }).click();
    await expect.poll((): number => countColorPixels(canvas, MA20_RGB)).toBeGreaterThan(0);
  });

  test("mousemove 出现 OHLC/MA tooltip，mouseleave 后消失", { timeout: 15_000 }, async () => {
    await render(<KlineChart bars={BARS} maBars={BARS} maText="5 20" />);
    const canvas = getCanvas();

    mouseMove(canvas, 0.5, 0.4);
    await expect.poll(readTooltipText).toContain("开盘");
    expect(readTooltipText()).toContain("收盘");
    expect(readTooltipText()).toContain("MA5");
    expect(readTooltipText()).toContain("MA20");
    expect(readTooltipDate()).not.toBeNull();

    canvas.dispatchEvent(
      new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
    );
    await expect
      .poll((): Element | null => document.querySelector(".pointer-events-none"))
      .toBeNull();
  });

  test("滚轮缩放改变可见窗口：canvas 像素变化且同位置日期改变", { timeout: 15_000 }, async () => {
    await render(<KlineChart bars={BARS} maBars={BARS} maText="5 20" />);
    const canvas = getCanvas();
    const baselineSignature = getCanvasSignature(canvas);

    mouseMove(canvas, 0.15, 0.4);
    await expect.poll(readTooltipDate).not.toBeNull();
    const dateBeforeZoom = readTooltipDate();

    wheelZoomIn(canvas);
    await expect.poll((): string => getCanvasSignature(canvas)).not.toBe(baselineSignature);

    mouseMove(canvas, 0.15, 0.4);
    await expect
      .poll((): string | null => {
        const date = readTooltipDate();
        return date && date !== dateBeforeZoom ? date : null;
      })
      .not.toBeNull();
  });

  test("缩放后拖拽 pan：canvas 像素变化且中心位置日期改变", { timeout: 15_000 }, async () => {
    await render(<KlineChart bars={BARS} maBars={BARS} maText="5 20" />);
    const canvas = getCanvas();

    const initialSignature = getCanvasSignature(canvas);
    wheelZoomIn(canvas);
    await expect.poll((): string => getCanvasSignature(canvas)).not.toBe(initialSignature);
    const zoomedSignature = getCanvasSignature(canvas);

    mouseMove(canvas, 0.5, 0.4);
    await expect.poll(readTooltipDate).not.toBeNull();
    const dateBeforeDrag = readTooltipDate();

    const point = plotClientPoint(canvas, 0.5, 0.4);
    canvas.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, ...point }),
    );
    window.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: point.clientX - 30,
        clientY: point.clientY,
      }),
    );
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));

    await expect.poll((): string => getCanvasSignature(canvas)).not.toBe(zoomedSignature);

    mouseMove(canvas, 0.5, 0.4);
    await expect
      .poll((): string | null => {
        const date = readTooltipDate();
        return date && date !== dateBeforeDrag ? date : null;
      })
      .not.toBeNull();
  });

  test("合法虚拟均线表达式绘制虚线、展示图例与 tooltip 行", { timeout: 15_000 }, async () => {
    await render(<KlineChart bars={BARS} maBars={BARS} maText="5 20" virtualMaText="MA5 * 2" />);
    const canvas = getCanvas();
    await expect.poll((): number => countColorPixels(canvas, VIRTUAL_MA_RGB)).toBeGreaterThan(0);
    await expect.element(page.getByRole("button", { name: "虚拟" })).toBeVisible();

    mouseMove(canvas, 0.5, 0.4);
    await expect.poll(readTooltipText).toContain("虚拟均线");
  });

  test("非法表达式不渲染虚拟均线与图例", { timeout: 15_000 }, async () => {
    await render(<KlineChart bars={BARS} maBars={BARS} maText="5 20" virtualMaText="MA5 +" />);
    const canvas = getCanvas();
    await expect.poll((): number => countColorPixels(canvas, UP_CANDLE_RGB)).toBeGreaterThan(0);
    expect(countColorPixels(canvas, VIRTUAL_MA_RGB)).toBe(0);
    await expect.element(page.getByRole("button", { name: "虚拟" })).not.toBeInTheDocument();
  });

  test("点击虚拟图例隐藏/恢复虚拟均线虚线", { timeout: 15_000 }, async () => {
    await render(<KlineChart bars={BARS} maBars={BARS} maText="5 20" virtualMaText="MA5 * 2" />);
    const canvas = getCanvas();
    await expect.poll((): number => countColorPixels(canvas, VIRTUAL_MA_RGB)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "虚拟" }).click();
    await expect.poll((): number => countColorPixels(canvas, VIRTUAL_MA_RGB)).toBe(0);

    await page.getByRole("button", { name: "虚拟" }).click();
    await expect.poll((): number => countColorPixels(canvas, VIRTUAL_MA_RGB)).toBeGreaterThan(0);
  });
});
