import { useState, type FC, type ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { DashboardToolbar } from "./dashboard-toolbar";
import type { ChartPeriod, ChartRange } from "./chart/chart-data";
import { makeSecurity } from "../../test-support/render";

const SECURITIES = [makeSecurity(), makeSecurity({ symbol: "510500", name: "上证50ETF" })];

interface ToolbarSpies {
  onSymbolChange: ReturnType<typeof vi.fn<(symbol: string) => void>>;
  onPeriodChange: ReturnType<typeof vi.fn<(period: ChartPeriod) => void>>;
  onRangeChange: ReturnType<typeof vi.fn<(range: ChartRange) => void>>;
  onMaTextChange: ReturnType<typeof vi.fn<(maText: string) => void>>;
  onVirtualMaTextChange: ReturnType<typeof vi.fn<(virtualMaText: string) => void>>;
  onRefresh: ReturnType<typeof vi.fn<() => void>>;
}

const createSpies = (): ToolbarSpies => ({
  onSymbolChange: vi.fn<(symbol: string) => void>(),
  onPeriodChange: vi.fn<(period: ChartPeriod) => void>(),
  onRangeChange: vi.fn<(range: ChartRange) => void>(),
  onMaTextChange: vi.fn<(maText: string) => void>(),
  onVirtualMaTextChange: vi.fn<(virtualMaText: string) => void>(),
  onRefresh: vi.fn<() => void>(),
});

/** 受控 harness：让 antd 控件保持真实的受控行为，同时把回调转接到 spy。 */
const ToolbarHarness: FC<{ spies: ToolbarSpies }> = (props: {
  spies: ToolbarSpies;
}): ReactElement => {
  const { spies } = props;
  const [symbol, setSymbol] = useState<string | null>("510300");
  const [period, setPeriod] = useState<ChartPeriod>("day");
  const [range, setRange] = useState<ChartRange>("all");
  const [maText, setMaText] = useState("5 20");
  const [virtualMaText, setVirtualMaText] = useState("");
  return (
    <DashboardToolbar
      securities={SECURITIES}
      selection={{ selectedSymbol: symbol, period, range, maText, virtualMaText }}
      isLoading={false}
      actions={{
        onSymbolChange: (value: string): void => {
          spies.onSymbolChange(value);
          setSymbol(value);
        },
        onPeriodChange: (value: ChartPeriod): void => {
          spies.onPeriodChange(value);
          setPeriod(value);
        },
        onRangeChange: (value: ChartRange): void => {
          spies.onRangeChange(value);
          setRange(value);
        },
        onMaTextChange: (value: string): void => {
          spies.onMaTextChange(value);
          setMaText(value);
        },
        onVirtualMaTextChange: (value: string): void => {
          spies.onVirtualMaTextChange(value);
          setVirtualMaText(value);
        },
        onRefresh: spies.onRefresh,
      }}
    />
  );
};

describe("DashboardToolbar", () => {
  test("切换周期 Segmented 触发 onPeriodChange", { timeout: 15_000 }, async () => {
    const spies = createSpies();
    await render(<ToolbarHarness spies={spies} />);

    await page.getByText("周", { exact: true }).click();
    await expect.poll((): boolean => spies.onPeriodChange.mock.calls.length > 0).toBe(true);
    expect(spies.onPeriodChange).toHaveBeenLastCalledWith("week");
  });

  test("切换范围 Segmented 触发 onRangeChange", { timeout: 15_000 }, async () => {
    const spies = createSpies();
    await render(<ToolbarHarness spies={spies} />);

    await page.getByText("近五年", { exact: true }).click();
    await expect.poll((): boolean => spies.onRangeChange.mock.calls.length > 0).toBe(true);
    expect(spies.onRangeChange).toHaveBeenLastCalledWith("5y");
  });

  test("均线输入框输入触发 onMaTextChange", { timeout: 15_000 }, async () => {
    const spies = createSpies();
    await render(<ToolbarHarness spies={spies} />);

    const maInput = page.getByRole("textbox", { name: "均线", exact: true });
    await userEvent.fill(maInput, "10 30");
    await expect
      .poll((): string => spies.onMaTextChange.mock.calls.at(-1)?.[0] ?? "")
      .toBe("10 30");
  });

  test("虚拟均线输入触发 onVirtualMaTextChange，非法表达式标红", { timeout: 15_000 }, async () => {
    const spies = createSpies();
    await render(<ToolbarHarness spies={spies} />);

    const virtualInput = page.getByPlaceholder("如 (MA5 + MA8) / 2");
    await userEvent.fill(virtualInput, "(MA5 + MA8) / 2");
    await expect
      .poll((): string => spies.onVirtualMaTextChange.mock.calls.at(-1)?.[0] ?? "")
      .toBe("(MA5 + MA8) / 2");
    await expect
      .poll(
        (): boolean =>
          document.querySelector(
            ".ant-input-status-error, .ant-input-outlined.ant-input-status-error",
          ) !== null,
      )
      .toBe(false);

    await userEvent.fill(virtualInput, "MA5 +");
    await expect
      .poll((): boolean => document.querySelector('[class*="ant-input-status-error"]') !== null)
      .toBe(true);
  });

  test("点击刷新按钮触发 onRefresh", { timeout: 15_000 }, async () => {
    const spies = createSpies();
    await render(<ToolbarHarness spies={spies} />);

    await page.getByRole("button", { name: "刷新" }).click();
    await expect.poll((): number => spies.onRefresh.mock.calls.length).toBe(1);
  });

  test("Select 展开选择标的触发 onSymbolChange", { timeout: 15_000 }, async () => {
    const spies = createSpies();
    await render(<ToolbarHarness spies={spies} />);

    await page.getByRole("combobox").click();
    await page.getByText("上证50ETF 510500", { exact: true }).click();
    await expect.poll((): boolean => spies.onSymbolChange.mock.calls.length > 0).toBe(true);
    expect(spies.onSymbolChange).toHaveBeenLastCalledWith("510500");
  });
});
