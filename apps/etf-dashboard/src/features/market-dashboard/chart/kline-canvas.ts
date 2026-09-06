import { formatLargeNumber, formatNumber } from "../market-number-format";
import type { ChartBar, MaSeries, VirtualMaSeries } from "./chart-data";

const MIN_X_AXIS_LABEL_GAP = 92;

export interface ChartLayout {
  priceTop: number;
  priceBottom: number;
  priceHeight: number;
  volumeTop: number;
  volumeBottom: number;
  volumeHeight: number;
  plotLeft: number;
  plotRight: number;
  plotWidth: number;
}

interface ChartGeometry extends ChartLayout {
  priceMin: number;
  priceMax: number;
  volumeMax: number;
  step: number;
}

export const getChartLayout = (params: { width: number; height: number }): ChartLayout => {
  const margin = { top: 24, right: 78, bottom: 30, left: 18 };
  // 成交量区高度跟随画布变化但限制上下界，防止窄高图里价格区被挤压。
  const volumeHeight = Math.max(86, Math.min(122, params.height * 0.2));
  const gap = 22;
  const priceTop = margin.top;
  const priceBottom = params.height - margin.bottom - volumeHeight - gap;
  const volumeTop = priceBottom + gap;
  const volumeBottom = params.height - margin.bottom;
  const plotLeft = margin.left;
  const plotRight = params.width - margin.right;

  return {
    priceTop,
    priceBottom,
    priceHeight: priceBottom - priceTop,
    volumeTop,
    volumeBottom,
    volumeHeight,
    plotLeft,
    plotRight,
    plotWidth: plotRight - plotLeft,
  };
};

export const isPointInPlot = (params: { layout: ChartLayout; x: number; y: number }): boolean =>
  params.x >= params.layout.plotLeft &&
  params.x <= params.layout.plotRight &&
  params.y >= params.layout.priceTop &&
  params.y <= params.layout.volumeBottom;

export const getVisibleIndexFromX = (params: {
  x: number;
  layout: ChartLayout;
  visibleLength: number;
}): number => {
  const step = params.layout.plotWidth / Math.max(params.visibleLength, 1);
  const value = Math.round((params.x - params.layout.plotLeft - step / 2) / step);
  return Math.min(Math.max(value, 0), Math.max(0, params.visibleLength - 1));
};

const getPaddedRange = (params: { min: number; max: number }): { min: number; max: number } => {
  if (!Number.isFinite(params.min) || !Number.isFinite(params.max)) {
    return { min: 0, max: 1 };
  }
  if (params.min === params.max) {
    const padding = Math.abs(params.min || 1) * 0.05;
    return { min: params.min - padding, max: params.max + padding };
  }
  const padding = (params.max - params.min) * 0.06;
  return { min: params.min - padding, max: params.max + padding };
};

const yForPrice = (params: { geometry: ChartGeometry; value: number }): number => {
  const rate =
    (params.value - params.geometry.priceMin) /
    (params.geometry.priceMax - params.geometry.priceMin || 1);
  return params.geometry.priceBottom - rate * params.geometry.priceHeight;
};

const yForVolume = (params: { geometry: ChartGeometry; value: number }): number => {
  const rate = params.value / (params.geometry.volumeMax || 1);
  return params.geometry.volumeBottom - rate * params.geometry.volumeHeight;
};

const xForIndex = (params: { geometry: ChartGeometry; index: number }): number =>
  params.geometry.plotLeft + params.geometry.step * params.index + params.geometry.step / 2;

const drawGrid = (params: { ctx: CanvasRenderingContext2D; geometry: ChartGeometry }): void => {
  const { ctx, geometry } = params;
  ctx.save();
  ctx.strokeStyle = "#e7eaf0";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);

  for (let index = 0; index <= 4; index += 1) {
    const y = geometry.priceTop + (geometry.priceHeight / 4) * index;
    ctx.beginPath();
    ctx.moveTo(geometry.plotLeft, y);
    ctx.lineTo(geometry.plotRight, y);
    ctx.stroke();
  }

  for (let index = 0; index <= 2; index += 1) {
    const y = geometry.volumeTop + (geometry.volumeHeight / 2) * index;
    ctx.beginPath();
    ctx.moveTo(geometry.plotLeft, y);
    ctx.lineTo(geometry.plotRight, y);
    ctx.stroke();
  }
  ctx.restore();
};

const drawCandles = (params: {
  ctx: CanvasRenderingContext2D;
  geometry: ChartGeometry;
  bars: ChartBar[];
}): void => {
  const bodyWidth = Math.min(Math.max(params.geometry.step * 0.62, 1), 16);
  const wickWidth = params.geometry.step < 3 ? 0.75 : 1;

  params.bars.forEach((record: ChartBar, index: number): void => {
    const x = xForIndex({ geometry: params.geometry, index });
    const isUp = record.close >= record.open;
    const color = isUp ? "#d54949" : "#159261";
    const openY = yForPrice({ geometry: params.geometry, value: record.open });
    const closeY = yForPrice({ geometry: params.geometry, value: record.close });
    const highY = yForPrice({ geometry: params.geometry, value: record.high });
    const lowY = yForPrice({ geometry: params.geometry, value: record.low });
    const top = Math.min(openY, closeY);
    const bodyHeight = Math.max(1, Math.abs(closeY - openY));
    const volumeY = yForVolume({ geometry: params.geometry, value: record.volume });
    const volumeHeight = Math.max(1, params.geometry.volumeBottom - volumeY);

    params.ctx.strokeStyle = color;
    params.ctx.fillStyle = color;
    params.ctx.lineWidth = wickWidth;
    params.ctx.beginPath();
    params.ctx.moveTo(x, highY);
    params.ctx.lineTo(x, lowY);
    params.ctx.stroke();
    params.ctx.fillRect(x - bodyWidth / 2, top, bodyWidth, bodyHeight);
    params.ctx.globalAlpha = 0.24;
    params.ctx.fillRect(x - bodyWidth / 2, volumeY, bodyWidth, volumeHeight);
    params.ctx.globalAlpha = 1;
  });
};

// 逐点折线追踪：null 点跳过形成自然断线；dashed 区分虚拟均线虚线与 MA 实线。
const traceSeriesLine = (params: {
  ctx: CanvasRenderingContext2D;
  geometry: ChartGeometry;
  values: Array<number | null>;
  color: string;
  dashed?: boolean;
}): void => {
  params.ctx.save();
  params.ctx.lineWidth = 1.5;
  params.ctx.strokeStyle = params.color;
  if (params.dashed) params.ctx.setLineDash([4, 4]);
  params.ctx.beginPath();
  let hasPoint = false;
  params.values.forEach((value: number | null, index: number): void => {
    if (!Number.isFinite(value)) {
      return;
    }
    const x = xForIndex({ geometry: params.geometry, index });
    const y = yForPrice({ geometry: params.geometry, value: value ?? 0 });
    if (!hasPoint) {
      params.ctx.moveTo(x, y);
      hasPoint = true;
      return;
    }
    params.ctx.lineTo(x, y);
  });
  if (hasPoint) {
    params.ctx.stroke();
  }
  params.ctx.restore();
};

const drawMaLines = (params: {
  ctx: CanvasRenderingContext2D;
  geometry: ChartGeometry;
  maSeries: MaSeries[];
}): void => {
  params.maSeries.forEach((series: MaSeries): void => {
    traceSeriesLine({
      ctx: params.ctx,
      geometry: params.geometry,
      values: series.values,
      color: series.color,
    });
  });
};

const drawAxes = (params: {
  ctx: CanvasRenderingContext2D;
  geometry: ChartGeometry;
  bars: ChartBar[];
}): void => {
  const { ctx, geometry, bars } = params;
  ctx.save();
  ctx.fillStyle = "#657084";
  ctx.strokeStyle = "#d6dbe5";
  ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textBaseline = "middle";

  for (let index = 0; index <= 4; index += 1) {
    const value = geometry.priceMax - ((geometry.priceMax - geometry.priceMin) / 4) * index;
    const y = geometry.priceTop + (geometry.priceHeight / 4) * index;
    ctx.fillText(formatNumber(value, 2), geometry.plotRight + 10, y);
  }
  ctx.fillText(
    formatLargeNumber(geometry.volumeMax),
    geometry.plotRight + 10,
    geometry.volumeTop + 4,
  );

  const labelCount = Math.min(
    7,
    bars.length,
    Math.max(1, Math.floor(geometry.plotWidth / MIN_X_AXIS_LABEL_GAP) + 1),
  );
  ctx.textBaseline = "top";
  for (let index = 0; index < labelCount; index += 1) {
    const dataIndex =
      labelCount === 1 ? 0 : Math.round((bars.length - 1) * (index / (labelCount - 1)));
    const record = bars[dataIndex];
    if (!record) {
      continue;
    }
    const x = xForIndex({ geometry, index: dataIndex });
    ctx.fillText(
      record.label,
      Math.min(Math.max(x - 24, geometry.plotLeft), geometry.plotRight - 48),
      geometry.volumeBottom + 9,
    );
  }
  ctx.restore();
};

const drawHover = (params: {
  ctx: CanvasRenderingContext2D;
  geometry: ChartGeometry;
  bars: ChartBar[];
  hoverIndex: number;
}): void => {
  const record = params.bars[params.hoverIndex];
  if (!record) {
    return;
  }
  const x = xForIndex({ geometry: params.geometry, index: params.hoverIndex });
  const y = yForPrice({ geometry: params.geometry, value: record.close });
  params.ctx.save();
  params.ctx.strokeStyle = "rgba(23, 32, 51, 0.45)";
  params.ctx.setLineDash([4, 4]);
  params.ctx.beginPath();
  params.ctx.moveTo(x, params.geometry.priceTop);
  params.ctx.lineTo(x, params.geometry.volumeBottom);
  params.ctx.moveTo(params.geometry.plotLeft, y);
  params.ctx.lineTo(params.geometry.plotRight, y);
  params.ctx.stroke();
  params.ctx.restore();
};

export const renderKlineCanvas = (params: {
  canvas: HTMLCanvasElement;
  bars: ChartBar[];
  maSeries: MaSeries[];
  virtualMa: VirtualMaSeries | null;
  hoverIndex: number | null;
}): void => {
  const rect = params.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, rect.width);
  const height = Math.max(360, rect.height);
  // canvas 物理像素按 DPR 放大，但后续绘制仍使用 CSS 像素坐标，保证高清屏不糊。
  params.canvas.width = Math.floor(width * dpr);
  params.canvas.height = Math.floor(height * dpr);

  const ctx = params.canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (params.bars.length === 0) {
    return;
  }

  const layout = getChartLayout({ width, height });
  const maValues = params.maSeries.flatMap((series: MaSeries): number[] =>
    series.values.filter((value: number | null): value is number => Number.isFinite(value)),
  );
  const virtualMaValues = (params.virtualMa?.values ?? []).filter(
    (value: number | null): value is number => Number.isFinite(value),
  );
  // 价格轴同时纳入蜡烛、MA 和虚拟均线，避免线超出当前 K 线高低点时被裁剪。
  const priceMin = Math.min(
    ...params.bars.map((record: ChartBar): number => record.low),
    ...maValues,
    ...virtualMaValues,
  );
  const priceMax = Math.max(
    ...params.bars.map((record: ChartBar): number => record.high),
    ...maValues,
    ...virtualMaValues,
  );
  const padded = getPaddedRange({ min: priceMin, max: priceMax });
  const geometry: ChartGeometry = {
    ...layout,
    priceMin: padded.min,
    priceMax: padded.max,
    volumeMax: Math.max(...params.bars.map((record: ChartBar): number => record.volume), 1),
    step: layout.plotWidth / Math.max(params.bars.length, 1),
  };

  ctx.fillStyle = "#fbfcfe";
  ctx.fillRect(0, layout.volumeTop - 8, width, height - layout.volumeTop + 8);
  drawGrid({ ctx, geometry });
  drawCandles({ ctx, geometry, bars: params.bars });
  drawMaLines({ ctx, geometry, maSeries: params.maSeries });
  if (params.virtualMa) {
    traceSeriesLine({
      ctx,
      geometry,
      values: params.virtualMa.values,
      color: params.virtualMa.color,
      dashed: true,
    });
  }
  drawAxes({ ctx, geometry, bars: params.bars });
  if (params.hoverIndex !== null) {
    drawHover({ ctx, geometry, bars: params.bars, hoverIndex: params.hoverIndex });
  }
};
