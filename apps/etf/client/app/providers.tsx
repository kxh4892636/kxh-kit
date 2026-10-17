import { StyleProvider } from "@ant-design/cssinjs";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { App as AntdApp, ConfigProvider } from "antd";
import type { FC, ReactElement } from "react";
import { routeTree } from "./router";

const reportQueryError = (error: Error): void => {
  console.error("ETF query failed", error);
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportQueryError }),
});

const router = createRouter({ routeTree });

export const AppProviders: FC = (): ReactElement => (
  <StyleProvider layer>
    <ConfigProvider>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  </StyleProvider>
);
