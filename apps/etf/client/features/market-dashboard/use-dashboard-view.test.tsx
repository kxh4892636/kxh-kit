import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import type { FC, ReactElement } from "react";
import { DASHBOARD_VIEW_STORAGE_KEY, useDashboardView } from "./use-dashboard-view";

const createStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length(): number {
      return data.size;
    },
    clear: (): void => data.clear(),
    getItem: (key: string): string | null => data.get(key) ?? null,
    key: (index: number): string | null => [...data.keys()][index] ?? null,
    removeItem: (key: string): void => {
      data.delete(key);
    },
    setItem: (key: string, value: string): void => {
      data.set(key, value);
    },
  };
};

interface HarnessProps {
  storage: Storage;
  symbol: string;
}

const Harness: FC<HarnessProps> = (props: HarnessProps): ReactElement => {
  const { view, updateView, resetView } = useDashboardView(props.symbol, {
    storage: props.storage,
  });
  return (
    <div>
      <span data-testid="period">{view.period}</span>
      <span data-testid="ma">{view.maText}</span>
      <button onClick={(): void => updateView({ period: "week", maText: "5 8" })}>set</button>
      <button onClick={resetView}>reset</button>
    </div>
  );
};

test("hook 按 symbol 读写并按默认值重置", { timeout: 15_000 }, async (): Promise<void> => {
  const storage = createStorage();
  await render(<Harness storage={storage} symbol="932315.CSI" />);
  await page.getByRole("button", { name: "set" }).click();
  await expect.element(page.getByTestId("period")).toHaveTextContent("week");
  expect(JSON.parse(storage.getItem(DASHBOARD_VIEW_STORAGE_KEY) ?? "null")).toMatchObject({
    bySymbol: { "932315.CSI": { period: "week", maText: "5 8" } },
  });
  await page.getByRole("button", { name: "reset" }).click();
  await expect.element(page.getByTestId("period")).toHaveTextContent("day");
  expect(JSON.parse(storage.getItem(DASHBOARD_VIEW_STORAGE_KEY) ?? "null")).toMatchObject({
    bySymbol: { "932315.CSI": { period: "day", maText: "5 8 13 21 34 55" } },
  });
});
