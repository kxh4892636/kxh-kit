import { sqliteTable, text, real, integer, primaryKey } from "drizzle-orm/sqlite-core";
export const securities = sqliteTable("securities", {
  symbol: text("symbol").primaryKey(),
  name: text("name").notNull(),
  assetType: text("asset_type").notNull(),
  exchange: text("exchange").notNull(),
  currency: text("currency").notNull(),
  source: text("source").notNull(),
  earliestTradeDate: text("earliest_trade_date").notNull(),
});

export const dailyBars = sqliteTable(
  "daily_bars",
  {
    symbol: text("symbol").notNull(),
    adjType: text("adj_type").notNull(),
    tradeDate: text("trade_date").notNull(),
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    volume: real("volume").notNull(),
    amount: real("amount").notNull(),
    changeAmount: real("change_amount").notNull(),
    changePercent: real("change_percent").notNull(),
    rawWeekday: text("raw_weekday").notNull(),
  },
  (table) => [primaryKey({ columns: [table.symbol, table.adjType, table.tradeDate] })],
);
export const tradingCalendar = sqliteTable(
  "trading_calendar",
  {
    exchange: text("exchange").notNull(),
    tradeDate: text("trade_date").notNull(),
    isOpen: integer("is_open").notNull(),
  },
  (table) => [primaryKey({ columns: [table.exchange, table.tradeDate] })],
);
