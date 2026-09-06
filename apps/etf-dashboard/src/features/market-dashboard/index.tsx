import { useEffect, useMemo, useState, type FC, type ReactElement } from "react";
import { Alert, Card, Spin, Typography } from "antd";
import type { Security } from "@/libs/api/client";
import { useDailyBars, useSecurities } from "@/libs/api/use-market";
import { DashboardToolbar } from "./dashboard-toolbar";
import { KlineChart } from "./chart/kline-chart";
import { MarketSummary } from "./market-summary";
import {
  aggregateBars,
  getRangeBars,
  type ChartBar,
  type ChartPeriod,
  type ChartRange,
} from "./chart/chart-data";

/**
 * 首页负责串起标的选择、行情查询和图表视图，是 ETF 看板的主要用户工作流入口。
 */
export const MarketDashboard: FC = (): ReactElement => {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [period, setPeriod] = useState<ChartPeriod>("day");
  const [range, setRange] = useState<ChartRange>("all");
  const [maText, setMaText] = useState("5 8 13 21 34 55");
  const [virtualMaText, setVirtualMaText] = useState("");
  const securitiesQuery = useSecurities();
  const dailyBarsQuery = useDailyBars(selectedSymbol);

  useEffect((): void => {
    // 首屏自动选择第一个可用标的，让看板在证券列表返回后立即形成有效查询。
    if (!selectedSymbol && securitiesQuery.data.length > 0) {
      setSelectedSymbol(securitiesQuery.data[0]?.symbol ?? null);
    }
  }, [securitiesQuery.data, selectedSymbol]);

  const fullChartBars = useMemo((): ChartBar[] => {
    const bars = dailyBarsQuery.data?.bars ?? [];
    return aggregateBars({ bars, period });
  }, [dailyBarsQuery.data?.bars, period]);

  const chartBars = useMemo(
    (): ChartBar[] =>
      getRangeBars({
        bars: fullChartBars,
        range,
      }),
    [fullChartBars, range],
  );

  const selectedSecurity = securitiesQuery.data.find(
    (item: Security): boolean => item.symbol === selectedSymbol,
  );
  const hasError = securitiesQuery.isError || dailyBarsQuery.isError;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <div>
        <Typography.Title level={3} className="m-0">
          ETF K 线看板
        </Typography.Title>
        <Typography.Text type="secondary">
          {selectedSecurity
            ? `${selectedSecurity.name} · ${selectedSecurity.symbol}`
            : "加载可用标的"}
        </Typography.Text>
      </div>
      <Card>
        <DashboardToolbar
          securities={securitiesQuery.data}
          selection={{ selectedSymbol, period, range, maText, virtualMaText }}
          isLoading={securitiesQuery.isLoading || dailyBarsQuery.isFetching}
          actions={{
            onSymbolChange: setSelectedSymbol,
            onPeriodChange: setPeriod,
            onRangeChange: setRange,
            onMaTextChange: setMaText,
            onVirtualMaTextChange: setVirtualMaText,
            onRefresh: dailyBarsQuery.refetch,
          }}
        />
      </Card>
      {hasError && <Alert type="error" showIcon title="数据加载失败，请确认 etf-service 已启动" />}
      <MarketSummary data={dailyBarsQuery.data} />
      <Card
        title="K 线"
        extra={
          dailyBarsQuery.data?.meta ? (
            <Typography.Text type="secondary">
              {dailyBarsQuery.data.meta.cacheStatus} · {dailyBarsQuery.data.meta.rows} 条
            </Typography.Text>
          ) : null
        }
      >
        <Spin spinning={dailyBarsQuery.isLoading && !dailyBarsQuery.data}>
          <KlineChart
            bars={chartBars}
            maBars={fullChartBars}
            maText={maText}
            virtualMaText={virtualMaText}
          />
        </Spin>
      </Card>
    </div>
  );
};
