import { hc, type InferResponseType } from "hono/client";
import { createContext } from "react";
import type { DailyBar, Security } from "@shared/market";
import type { AppType } from "../../../server/app.ts";
import { API_BASE_URL } from "./config";

// 空 baseUrl 只用于在编译期实例化 Client 类型，不发起请求。
const typedClient = hc<AppType>("");

export type Client = typeof typedClient;

export const hcWithType = (...args: Parameters<typeof hc>): Client => hc<AppType>(...args);

export const createEtfClient = (baseUrl: string, fetcher?: typeof fetch): Client =>
  hcWithType(baseUrl, fetcher ? { fetch: fetcher } : undefined);

export type EtfClient = Client;
export type { DailyBar, Security };
export type GetDailyBarsResponse = NonNullable<
  InferResponseType<EtfClient["api"]["daily-bars"]["$get"], 200>["data"]
>;

export const ApiContext = createContext<EtfClient>(createEtfClient(API_BASE_URL));
