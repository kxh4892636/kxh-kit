import { hc, type InferResponseType } from "hono/client";
import { createContext } from "react";
import type { AppType } from "@kxh4892636/etf-service/api";
import { API_BASE_URL } from "../../app/config";
export const createEtfClient = (baseUrl: string, fetcher?: typeof fetch) =>
  hc<AppType>(baseUrl, { fetch: fetcher });
export type EtfClient = ReturnType<typeof createEtfClient>;
export type GetDailyBarsResponse = InferResponseType<EtfClient["api"]["daily-bars"]["$get"]>;
export type DailyBar = GetDailyBarsResponse["bars"][number];
export type Security = GetDailyBarsResponse["security"];
export const ApiContext = createContext<EtfClient>(createEtfClient(API_BASE_URL));
