import { z } from "zod";
import { isValidTradeDate } from "../../shared/utils/trade-date.ts";

export const tradeDate = z.string().refine(isValidTradeDate, "日期无效");

export const shanghaiDate = (now: Date): string =>
  new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
