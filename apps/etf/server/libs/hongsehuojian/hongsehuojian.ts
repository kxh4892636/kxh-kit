import type { DailyBar } from "../../../shared/market.ts";
import type { RemoteFetcher } from "../../market/service/market-service.ts";
import { MarketError } from "../../market/service/errors.ts";
import { shanghaiDate } from "../../utils/dates.ts";
import { parseKline } from "./kline-response.ts";
interface FetchOptions {
  fetch?: typeof fetch;
  endpoint?: string;
  now?: () => Date;
  timeoutMs?: number;
}
const FULL_HISTORY_COUNT = "-10000";
const limitedJson = async (response: Response): Promise<unknown> => {
  if (!response.body) throw new Error("上游响应为空");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8 * 1024 * 1024) throw new Error("上游响应超过 8 MiB");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch((): void => {});
    reader.releaseLock();
  }
};
export const createRemoteFetcher =
  (options: FetchOptions = {}): RemoteFetcher =>
  async (symbol: string, adjType: string, signal?: AbortSignal): Promise<DailyBar[]> => {
    const now = (options.now ?? ((): Date => new Date()))();
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 15000);
    try {
      signal?.throwIfAborted();
      if (adjType !== "qfq") throw new Error("只支持前复权");
      const url = new URL(options.endpoint ?? "https://hongsehuojian.com/fundex-quote/line/kline");
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("上游地址协议无效");
      url.search = new URLSearchParams({
        securityCode: symbol,
        period: "day",
        count: FULL_HISTORY_COUNT,
        begin: shanghaiDate(now).replaceAll("-", ""),
        adjust: "1",
        ts: String(now.getTime()),
      }).toString();
      const response = await (options.fetch ?? fetch)(url, {
        headers: { accept: "application/json" },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("上游 HTTP " + response.status);
      }
      return parseKline(await limitedJson(response), symbol, adjType);
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted) throw new MarketError("deadline_exceeded", "上游请求超时");
      throw new MarketError("upstream_unavailable", "上游行情不可用", { cause: error });
    }
  };
