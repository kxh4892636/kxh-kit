import { useEffect, useState } from "react";
import {
  PERIOD_OPTIONS,
  RANGE_OPTIONS,
  type ChartPeriod,
  type ChartRange,
} from "./chart/chart-data";

export const DASHBOARD_VIEW_STORAGE_KEY = "etf:dashboard:views:v1";

export interface DashboardView {
  period: ChartPeriod;
  range: ChartRange;
  maText: string;
  virtualMaText: string;
}

export interface DashboardViewStore {
  version: 1;
  bySymbol: Record<string, DashboardView>;
}

export const DEFAULT_DASHBOARD_VIEW: DashboardView = {
  period: "day",
  range: "all",
  maText: "5 8 13 21 34 55",
  virtualMaText: "",
};

const PERIOD_VALUES = new Set<string>(PERIOD_OPTIONS.map((option): ChartPeriod => option.value));
const RANGE_VALUES = new Set<string>(RANGE_OPTIONS.map((option): ChartRange => option.value));
const SAFE_SYMBOL = /^[A-Za-z0-9._-]{1,64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPeriod = (value: unknown): value is ChartPeriod =>
  typeof value === "string" && PERIOD_VALUES.has(value);

const isRange = (value: unknown): value is ChartRange =>
  typeof value === "string" && RANGE_VALUES.has(value);

export const createDefaultDashboardViewStore = (): DashboardViewStore => ({
  version: 1,
  bySymbol: {},
});

export const parseDashboardView = (value: unknown): DashboardView => {
  if (!isRecord(value)) return { ...DEFAULT_DASHBOARD_VIEW };
  return {
    period: isPeriod(value["period"]) ? value["period"] : DEFAULT_DASHBOARD_VIEW.period,
    range: isRange(value["range"]) ? value["range"] : DEFAULT_DASHBOARD_VIEW.range,
    maText: typeof value["maText"] === "string" ? value["maText"] : DEFAULT_DASHBOARD_VIEW.maText,
    virtualMaText:
      typeof value["virtualMaText"] === "string"
        ? value["virtualMaText"]
        : DEFAULT_DASHBOARD_VIEW.virtualMaText,
  };
};

export const parseDashboardViewStore = (value: unknown): DashboardViewStore => {
  if (!isRecord(value) || value["version"] !== 1 || !isRecord(value["bySymbol"])) {
    return createDefaultDashboardViewStore();
  }
  const bySymbol: Record<string, DashboardView> = {};
  for (const [symbol, view] of Object.entries(value["bySymbol"])) {
    if (!SAFE_SYMBOL.test(symbol) || !isRecord(view)) continue;
    bySymbol[symbol] = parseDashboardView(view);
  }
  return { version: 1, bySymbol };
};

const getDefaultStorage = (): Storage | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

export const loadDashboardViewStore = (storage?: Storage): DashboardViewStore => {
  const target = storage ?? getDefaultStorage();
  if (!target) return createDefaultDashboardViewStore();
  try {
    return parseDashboardViewStore(
      JSON.parse(target.getItem(DASHBOARD_VIEW_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return createDefaultDashboardViewStore();
  }
};

export const saveDashboardViewStore = (store: DashboardViewStore, storage?: Storage): void => {
  const target = storage ?? getDefaultStorage();
  if (!target) return;
  try {
    target.setItem(DASHBOARD_VIEW_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage 可能因配额、隐私模式或浏览器策略不可写；不影响看板使用。
  }
};

interface UseDashboardViewOptions {
  storage?: Storage;
}

export interface DashboardViewState {
  view: DashboardView;
  updateView: (patch: Partial<DashboardView>) => void;
  resetView: () => void;
}

/**
 * 外部存储读写只在当前 hook 内完成：按 symbol 恢复/更新四个筛选字段。
 */
export const useDashboardView = (
  symbol: string | null,
  options: UseDashboardViewOptions = {},
): DashboardViewState => {
  const storage = options.storage;
  const [store, setStore] = useState<DashboardViewStore>(() => loadDashboardViewStore(storage));
  useEffect((): void => {
    saveDashboardViewStore(store, storage);
  }, [store, storage]);
  const view = symbol ? (store.bySymbol[symbol] ?? DEFAULT_DASHBOARD_VIEW) : DEFAULT_DASHBOARD_VIEW;
  const updateView = (patch: Partial<DashboardView>): void => {
    if (!symbol) return;
    setStore((current: DashboardViewStore): DashboardViewStore => {
      const previous = current.bySymbol[symbol] ?? DEFAULT_DASHBOARD_VIEW;
      return {
        ...current,
        bySymbol: { ...current.bySymbol, [symbol]: { ...previous, ...patch } },
      };
    });
  };
  const resetView = (): void => {
    if (!symbol) return;
    setStore((current: DashboardViewStore): DashboardViewStore => ({
      ...current,
      bySymbol: { ...current.bySymbol, [symbol]: { ...DEFAULT_DASHBOARD_VIEW } },
    }));
  };
  return { view, updateView, resetView };
};
