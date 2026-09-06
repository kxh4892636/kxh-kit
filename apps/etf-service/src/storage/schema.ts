import { sqliteTable, text } from "drizzle-orm/sqlite-core";
export const securities = sqliteTable("securities", {
  symbol: text("symbol").primaryKey(),
  name: text("name").notNull(),
  assetType: text("asset_type").notNull(),
  exchange: text("exchange").notNull(),
  currency: text("currency").notNull(),
  source: text("source").notNull(),
  earliestTradeDate: text("earliest_trade_date").notNull(),
});
