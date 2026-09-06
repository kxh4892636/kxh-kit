import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  MouseEventHandler,
  RefObject,
  SetStateAction,
} from "react";
import { getChartLayout, getVisibleIndexFromX, isPointInPlot } from "./kline-canvas";
import type { ChartBar } from "./chart-data";

const MIN_VISIBLE_CANDLES = 20;
const WHEEL_ZOOM_IN_RATE = 0.82;
const WHEEL_ZOOM_OUT_RATE = 1.22;

export interface ZoomWindow {
  start: number;
  end: number;
}

export interface TooltipState {
  index: number;
  left: number;
  top: number;
}

interface DragState {
  startX: number;
  zoomStart: number;
  visibleCount: number;
  totalCount: number;
  step: number;
}

interface CanvasPoint {
  rect: DOMRect;
  x: number;
  y: number;
}

interface PointerCoordinates {
  clientX: number;
  clientY: number;
}

interface ViewportResult {
  dragRef: RefObject<DragState | null>;
  zoomWindow: ZoomWindow;
  visibleBars: ChartBar[];
  handleMouseDown: MouseEventHandler<HTMLCanvasElement>;
}

interface KlineInteractionsResult extends Omit<ViewportResult, "dragRef"> {
  tooltip: TooltipState | null;
  handleMouseMove: MouseEventHandler<HTMLCanvasElement>;
  clearTooltip: () => void;
}

const getCanvasPoint = (params: {
  canvas: HTMLCanvasElement;
  event: PointerCoordinates;
}): CanvasPoint => {
  const rect = params.canvas.getBoundingClientRect();
  return {
    rect,
    x: params.event.clientX - rect.left,
    y: params.event.clientY - rect.top,
  };
};

const normalizeZoom = (params: { zoom: ZoomWindow | null; totalCount: number }): ZoomWindow => {
  if (!params.zoom || params.totalCount <= 0) {
    return { start: 0, end: params.totalCount };
  }
  const minVisible = Math.min(MIN_VISIBLE_CANDLES, params.totalCount);
  const currentCount = Math.max(minVisible, params.zoom.end - params.zoom.start);
  const visibleCount = Math.min(currentCount, params.totalCount);
  const start = Math.min(
    Math.max(params.zoom.start, 0),
    Math.max(0, params.totalCount - visibleCount),
  );
  return { start, end: start + visibleCount };
};

const getWheelZoom = (params: {
  totalCount: number;
  visibleCount: number;
  visibleIndex: number;
  zoomStart: number;
  deltaY: number;
}): ZoomWindow | null => {
  const anchorIndex = params.zoomStart + params.visibleIndex;
  const anchorRatio =
    params.visibleCount <= 1 ? 0 : params.visibleIndex / (params.visibleCount - 1);
  const rate = params.deltaY < 0 ? WHEEL_ZOOM_IN_RATE : WHEEL_ZOOM_OUT_RATE;
  const minVisible = Math.min(MIN_VISIBLE_CANDLES, params.totalCount);
  const nextVisible = Math.min(
    Math.max(Math.round(params.visibleCount * rate), minVisible),
    params.totalCount,
  );
  if (nextVisible === params.totalCount) {
    return null;
  }
  const requestedStart = Math.round(anchorIndex - anchorRatio * (nextVisible - 1));
  const start = Math.min(Math.max(requestedStart, 0), Math.max(0, params.totalCount - nextVisible));
  return { start, end: start + nextVisible };
};

const useWheelZoom = (params: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  totalCount: number;
  visibleCount: number;
  zoomStart: number;
  setZoom: Dispatch<SetStateAction<ZoomWindow | null>>;
  clearTooltip: () => void;
}): void => {
  const { canvasRef, totalCount, visibleCount, zoomStart, setZoom, clearTooltip } = params;
  useEffect((): (() => void) | undefined => {
    const canvas = canvasRef.current;
    if (!canvas || visibleCount === 0) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent): void => {
      const { rect, x, y } = getCanvasPoint({ canvas, event });
      const layout = getChartLayout({ width: rect.width, height: rect.height });
      if (!isPointInPlot({ layout, x, y })) {
        return;
      }
      event.preventDefault();
      const visibleIndex = getVisibleIndexFromX({
        x,
        layout,
        visibleLength: visibleCount,
      });
      setZoom(
        getWheelZoom({
          totalCount,
          visibleCount,
          visibleIndex,
          zoomStart,
          deltaY: event.deltaY,
        }),
      );
      clearTooltip();
    };
    // 原生非被动监听仅在指针位于图表内时接管滚轮缩放。
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return (): void => canvas.removeEventListener("wheel", handleWheel);
  }, [canvasRef, clearTooltip, setZoom, totalCount, visibleCount, zoomStart]);
};

const useDragPan = (params: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  dragRef: RefObject<DragState | null>;
  totalCount: number;
  visibleCount: number;
  zoomStart: number;
  setZoom: Dispatch<SetStateAction<ZoomWindow | null>>;
  clearTooltip: () => void;
}): MouseEventHandler<HTMLCanvasElement> => {
  const { canvasRef, dragRef, totalCount, visibleCount, zoomStart, setZoom, clearTooltip } = params;
  useEffect((): (() => void) => {
    const handleMove = (event: MouseEvent): void => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = Math.round((event.clientX - drag.startX) / Math.max(drag.step, 1));
      const start = Math.min(
        Math.max(drag.zoomStart - delta, 0),
        drag.totalCount - drag.visibleCount,
      );
      setZoom({ start, end: start + drag.visibleCount });
    };
    const handleUp = (): void => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return (): void => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragRef, setZoom]);

  return useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>): void => {
      const canvas = canvasRef.current;
      if (!canvas || event.button !== 0 || totalCount <= visibleCount) return;
      const { rect, x, y } = getCanvasPoint({ canvas, event });
      const layout = getChartLayout({ width: rect.width, height: rect.height });
      if (!isPointInPlot({ layout, x, y })) return;
      event.preventDefault();
      dragRef.current = {
        startX: event.clientX,
        zoomStart,
        visibleCount,
        totalCount,
        // 按蜡烛宽度换算索引移动，保持不同画布尺寸下拖拽手感一致。
        step: layout.plotWidth / Math.max(visibleCount, 1),
      };
      clearTooltip();
    },
    [canvasRef, clearTooltip, dragRef, totalCount, visibleCount, zoomStart],
  );
};

const useViewport = (params: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  bars: ChartBar[];
  clearTooltip: () => void;
}): ViewportResult => {
  const dragRef = useRef<DragState | null>(null);
  const [zoom, setZoom] = useState<ZoomWindow | null>(null);
  const zoomWindow = normalizeZoom({ zoom, totalCount: params.bars.length });
  const visibleBars = useMemo(
    (): ChartBar[] => params.bars.slice(zoomWindow.start, zoomWindow.end),
    [params.bars, zoomWindow.end, zoomWindow.start],
  );
  useEffect((): void => setZoom(null), [params.bars]);
  useWheelZoom({
    canvasRef: params.canvasRef,
    totalCount: params.bars.length,
    visibleCount: visibleBars.length,
    zoomStart: zoomWindow.start,
    setZoom,
    clearTooltip: params.clearTooltip,
  });
  const handleMouseDown = useDragPan({
    canvasRef: params.canvasRef,
    dragRef,
    totalCount: params.bars.length,
    visibleCount: visibleBars.length,
    zoomStart: zoomWindow.start,
    setZoom,
    clearTooltip: params.clearTooltip,
  });
  return { dragRef, zoomWindow, visibleBars, handleMouseDown };
};

export const useKlineInteractions = (params: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  bars: ChartBar[];
}): KlineInteractionsResult => {
  const { canvasRef, bars } = params;
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const clearTooltip = useCallback((): void => setTooltip(null), []);
  const viewport = useViewport({ canvasRef, bars, clearTooltip });
  useEffect((): void => clearTooltip(), [bars, clearTooltip]);
  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>): void => {
      const canvas = canvasRef.current;
      if (!canvas || viewport.dragRef.current || viewport.visibleBars.length === 0) return;
      const { rect, x, y } = getCanvasPoint({ canvas, event });
      const layout = getChartLayout({ width: rect.width, height: rect.height });
      if (!isPointInPlot({ layout, x, y })) {
        clearTooltip();
        return;
      }
      setTooltip({
        index: getVisibleIndexFromX({ x, layout, visibleLength: viewport.visibleBars.length }),
        left: Math.min(Math.max(x + 14, 8), Math.max(8, rect.width - 250)),
        top: Math.min(Math.max(y + 14, 8), Math.max(8, rect.height - 250)),
      });
    },
    [canvasRef, clearTooltip, viewport.dragRef, viewport.visibleBars.length],
  );
  return {
    zoomWindow: viewport.zoomWindow,
    visibleBars: viewport.visibleBars,
    handleMouseDown: viewport.handleMouseDown,
    tooltip,
    handleMouseMove,
    clearTooltip,
  };
};
