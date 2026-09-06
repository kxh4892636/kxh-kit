import { z } from "zod";
import { tradeDate } from "../market/dates.ts";
import type { DailyBar } from "../market/daily-bars.ts";
const payloadSchema = z.object({
  securityCode: z.string().optional(),
  columns: z.string(),
  items: z.string(),
});
const envelopeSchema = z.object({ data: payloadSchema.nullish() }).passthrough();
const requiredNumber = z.string().trim().min(1).transform(Number).pipe(z.number().finite());
const rowSchema = z
  .object({
    tradeDate,
    open: requiredNumber,
    high: requiredNumber,
    low: requiredNumber,
    close: requiredNumber,
    volume: z.string().optional(),
    amount: z.string().optional(),
    change: z.string().optional(),
    changePercent: z.string().optional(),
    week: z.string().optional(),
  })
  .refine(
    (row): boolean =>
      row.high >= Math.max(row.open, row.close) && row.low <= Math.min(row.open, row.close),
    "价格区间无效",
  );
const optionalNumber = (value: string | undefined, fallback: number): number =>
  value?.trim() ? requiredNumber.parse(value) : fallback;
export const parseKline = (input: unknown, symbol: string, adjType: string): DailyBar[] => {
  const envelope = envelopeSchema.parse(input);
  const payload = payloadSchema.parse(envelope.data ?? envelope);
  if (payload.securityCode && payload.securityCode !== symbol)
    throw new Error("上游证券标识不一致");
  const columns = payload.columns
    .split(",")
    .map((value: string): string => value.trim())
    .filter(Boolean);
  if (
    !["tradeDate", "open", "high", "low", "close"].every((key: string): boolean =>
      columns.includes(key),
    )
  )
    throw new Error("上游缺少日线字段");
  const rows = payload.items
    .split(";")
    .map((value: string): string => value.trim())
    .filter(Boolean);
  if (!rows.length) throw new Error("上游没有日线");
  return rows
    .map((line: string): DailyBar => {
      const values = line.split(",");
      if (values.length < columns.length) throw new Error("上游行字段不足");
      const record = Object.fromEntries(
        columns.map((column: string, index: number): [string, string] => [
          column,
          values[index].trim(),
        ]),
      );
      const row = rowSchema.parse(record);
      const volume = z.number().nonnegative().parse(optionalNumber(row.volume, 0)),
        amount = z.number().nonnegative().parse(optionalNumber(row.amount, 0));
      const change = row.close - row.open;
      return {
        symbol,
        adjType,
        tradeDate: row.tradeDate,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume,
        amount,
        changeAmount: optionalNumber(row.change, change),
        changePercent: optionalNumber(
          row.changePercent,
          row.open === 0 ? 0 : (change / row.open) * 100,
        ),
        rawWeekday: row.week ?? "",
      };
    })
    .sort((left: DailyBar, right: DailyBar): number =>
      left.tradeDate.localeCompare(right.tradeDate),
    );
};
