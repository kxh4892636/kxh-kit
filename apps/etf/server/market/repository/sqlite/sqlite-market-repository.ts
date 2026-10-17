import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { DailyBar, Security } from "../../../../shared/market.ts";
import type { SqliteDatabase } from "../../../libs/sqlite/database.ts";
import type { MarketRepository, TradingDay } from "../market-repository.ts";
import { supportedSecurities } from "../securities.ts";
import { dailyBars, securities, tradingCalendar } from "./schema.ts";

const seed = (db: SqliteDatabase): void => {
  db.transaction((tx): void => {
    for (const definition of supportedSecurities)
      tx.insert(securities)
        .values(definition)
        .onConflictDoUpdate({ target: securities.symbol, set: definition })
        .run();
  });
};

export const createSqliteMarketRepository = (db: SqliteDatabase): MarketRepository => {
  seed(db);
  const latestDate = (symbol: string, adjType: string): string | undefined =>
    db
      .select({ date: dailyBars.tradeDate })
      .from(dailyBars)
      .where(and(eq(dailyBars.symbol, symbol), eq(dailyBars.adjType, adjType)))
      .orderBy(desc(dailyBars.tradeDate))
      .limit(1)
      .get()?.date;
  return {
    latestDate,
    listSecurities: (): Security[] =>
      db
        .select()
        .from(securities)
        .orderBy(securities.symbol)
        .all()
        .map((security): Security => ({
          ...security,
          latestCachedTradeDate: latestDate(security.symbol, "qfq"),
        })),
    findSecurity: (symbol: string): Security | undefined =>
      db.select().from(securities).where(eq(securities.symbol, symbol)).get(),
    listBars: (symbol: string, adjType: string, start: string, end: string): DailyBar[] =>
      db
        .select()
        .from(dailyBars)
        .where(
          and(
            eq(dailyBars.symbol, symbol),
            eq(dailyBars.adjType, adjType),
            gte(dailyBars.tradeDate, start),
            lte(dailyBars.tradeDate, end),
          ),
        )
        .orderBy(dailyBars.tradeDate)
        .all(),
    tradingDays: (exchange: string, start: string, end: string): TradingDay[] =>
      db
        .select()
        .from(tradingCalendar)
        .where(
          and(
            eq(tradingCalendar.exchange, exchange),
            gte(tradingCalendar.tradeDate, start),
            lte(tradingCalendar.tradeDate, end),
          ),
        )
        .all(),
    saveRefresh: (bars: DailyBar[], days: TradingDay[]): void => {
      db.transaction((tx): void => {
        // 事务保证整批 upsert 一次提交，日线和日历不会部分写入。
        for (const bar of bars)
          tx.insert(dailyBars)
            .values(bar)
            .onConflictDoUpdate({
              target: [dailyBars.symbol, dailyBars.adjType, dailyBars.tradeDate],
              set: bar,
            })
            .run();
        for (const day of days)
          tx.insert(tradingCalendar)
            .values(day)
            .onConflictDoUpdate({
              target: [tradingCalendar.exchange, tradingCalendar.tradeDate],
              set: { isOpen: day.isOpen },
            })
            .run();
      });
    },
  };
};
