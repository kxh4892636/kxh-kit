import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiContext, type GetDailyBarsResponse, type Security } from "./client";
interface UseSecuritiesResult {
  data: Security[];
  isLoading: boolean;
  isError: boolean;
}
interface UseDailyBarsResult {
  data: GetDailyBarsResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}
export const useSecurities = (): UseSecuritiesResult => {
  const client = useContext(ApiContext);
  const query = useQuery({
    queryKey: ["securities"],
    queryFn: async ({ signal }): Promise<Security[]> => {
      const response = await client.api.securities.$get({}, { init: { signal } });
      if (!response.ok) throw new Error("证券列表加载失败");
      return (
        (await response.json())?.securities?.filter((item): boolean => Boolean(item?.symbol)) ?? []
      );
    },
  });
  return { data: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
};
export const useDailyBars = (symbol: string | null): UseDailyBarsResult => {
  const client = useContext(ApiContext);
  const query = useQuery({
    queryKey: ["daily-bars", symbol],
    enabled: Boolean(symbol),
    queryFn: async ({ signal }): Promise<GetDailyBarsResponse> => {
      const response = await client.api["daily-bars"].$get(
        { query: { symbol: symbol ?? "", adjType: "qfq" } },
        { init: { signal } },
      );
      if (!response.ok) throw new Error("日线加载失败");
      return response.json();
    },
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: (): void => {
      void query.refetch();
    },
  };
};
