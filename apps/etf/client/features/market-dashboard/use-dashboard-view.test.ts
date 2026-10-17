import { expect, test } from "vite-plus/test";
import {
  createDefaultDashboardViewStore,
  DASHBOARD_VIEW_STORAGE_KEY,
  DEFAULT_DASHBOARD_VIEW,
  loadDashboardViewStore,
  parseDashboardViewStore,
  saveDashboardViewStore,
} from "./use-dashboard-view";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

test("解析缺失/损坏/版本不符的存储时回退默认", (): void => {
  expect(parseDashboardViewStore(null)).toEqual(createDefaultDashboardViewStore());
  expect(parseDashboardViewStore({})).toEqual(createDefaultDashboardViewStore());
  expect(parseDashboardViewStore({ version: 2, bySymbol: {} })).toEqual(
    createDefaultDashboardViewStore(),
  );
  expect(parseDashboardViewStore({ version: 1, bySymbol: [] })).toEqual(
    createDefaultDashboardViewStore(),
  );
});

test("按 symbol 解析合法状态，非法字段回退默认", (): void => {
  const store = parseDashboardViewStore({
    version: 1,
    bySymbol: {
      "932315.CSI": {
        period: "week",
        range: "1y",
        maText: "5 8",
        virtualMaText: "(MA5 + MA8) / 2",
      },
      "930955.CSI": { period: "bad", range: "bad", maText: 1, virtualMaText: null },
      invalid: "not-an-object",
      __proto__: { period: "week" },
    },
  });
  expect(store.bySymbol["932315.CSI"]).toEqual({
    period: "week",
    range: "1y",
    maText: "5 8",
    virtualMaText: "(MA5 + MA8) / 2",
  });
  expect(store.bySymbol["930955.CSI"]).toEqual(DEFAULT_DASHBOARD_VIEW);
  expect(Object.keys(store.bySymbol)).not.toContain("invalid");
  expect(Object.prototype.hasOwnProperty.call(store.bySymbol, "__proto__")).toBe(false);
});

test("读写 localStorage，并对读取/写入异常容错", (): void => {
  const storage = new MemoryStorage();
  const store = {
    version: 1 as const,
    bySymbol: { "932315.CSI": { ...DEFAULT_DASHBOARD_VIEW, period: "month" as const } },
  };
  saveDashboardViewStore(store, storage);
  expect(JSON.parse(storage.getItem(DASHBOARD_VIEW_STORAGE_KEY) ?? "null")).toEqual(store);
  expect(loadDashboardViewStore(storage)).toEqual(store);

  storage.setItem(DASHBOARD_VIEW_STORAGE_KEY, "{broken");
  expect(loadDashboardViewStore(storage)).toEqual(createDefaultDashboardViewStore());

  const broken: Storage = {
    length: 0,
    clear: (): void => {},
    getItem: (): string => {
      throw new Error("blocked");
    },
    key: (): string | null => null,
    removeItem: (): void => {},
    setItem: (): void => {
      throw new Error("quota");
    },
  };
  expect(loadDashboardViewStore(broken)).toEqual(createDefaultDashboardViewStore());
  expect(() => saveDashboardViewStore(store, broken)).not.toThrow();
});
