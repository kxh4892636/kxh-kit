import { Button, Input, Segmented, Select, Space } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ChangeEvent, FC, ReactElement } from "react";
import type { Security } from "@/libs/api/client";
import {
  PERIOD_OPTIONS,
  RANGE_OPTIONS,
  type ChartPeriod,
  type ChartRange,
} from "./chart/chart-data";
import { parseVirtualMaExpression } from "./chart/virtual-ma-expression";

interface ToolbarSelection {
  selectedSymbol: string | null;
  period: ChartPeriod;
  range: ChartRange;
  maText: string;
  virtualMaText: string;
}
interface ToolbarActions {
  onSymbolChange: (symbol: string) => void;
  onPeriodChange: (period: ChartPeriod) => void;
  onRangeChange: (range: ChartRange) => void;
  onMaTextChange: (text: string) => void;
  onVirtualMaTextChange: (text: string) => void;
  onRefresh: () => void;
}
interface DashboardToolbarProps {
  securities: Security[];
  selection: ToolbarSelection;
  actions: ToolbarActions;
  isLoading: boolean;
}
/**
 * 工具栏集中承载图表筛选条件，避免主页面混入控件细节而削弱数据流可读性。
 */
export const DashboardToolbar: FC<DashboardToolbarProps> = (
  props: DashboardToolbarProps,
): ReactElement => {
  const { securities, isLoading, selection, actions } = props;
  const { selectedSymbol, period, range, maText, virtualMaText } = selection;
  const {
    onSymbolChange,
    onPeriodChange,
    onRangeChange,
    onMaTextChange,
    onVirtualMaTextChange,
    onRefresh,
  } = actions;
  const handleMaTextChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onMaTextChange(event.target.value);
  };
  const handleVirtualMaTextChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onVirtualMaTextChange(event.target.value);
  };
  const isVirtualMaInvalid =
    virtualMaText.trim() !== "" && parseVirtualMaExpression(virtualMaText) === null;

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex min-w-[260px] flex-col gap-1">
        <span className="text-xs text-slate-500">标的</span>
        <Select
          value={selectedSymbol}
          loading={isLoading}
          options={securities.map((security: Security): { value: string; label: string } => ({
            value: security.symbol,
            label: `${security.name} ${security.symbol}`,
          }))}
          onChange={onSymbolChange}
          optionFilterProp="label"
          showSearch
        />
      </label>
      <Space orientation="vertical" size={4}>
        <span className="text-xs text-slate-500">周期</span>
        <Segmented<ChartPeriod> value={period} options={PERIOD_OPTIONS} onChange={onPeriodChange} />
      </Space>
      <Space orientation="vertical" size={4}>
        <span className="text-xs text-slate-500">范围</span>
        <Segmented<ChartRange>
          value={range}
          options={RANGE_OPTIONS.map(
            (option: (typeof RANGE_OPTIONS)[number]): { value: ChartRange; label: string } => ({
              value: option.value,
              label: option.label,
            }),
          )}
          onChange={onRangeChange}
        />
      </Space>
      <label className="flex min-w-[190px] flex-col gap-1">
        <span className="text-xs text-slate-500">均线</span>
        <Input value={maText} onChange={handleMaTextChange} />
      </label>
      <label className="flex min-w-[190px] flex-col gap-1">
        <span className="text-xs text-slate-500">虚拟均线</span>
        <Input
          value={virtualMaText}
          onChange={handleVirtualMaTextChange}
          placeholder="如 (MA5 + MA8) / 2"
          status={isVirtualMaInvalid ? "error" : ""}
        />
      </label>
      <Button icon={<ReloadOutlined />} loading={isLoading} onClick={onRefresh}>
        刷新
      </Button>
    </div>
  );
};
