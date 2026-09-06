CREATE TABLE `daily_bars` (
	`symbol` text NOT NULL,
	`adj_type` text NOT NULL,
	`trade_date` text NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` real NOT NULL,
	`amount` real NOT NULL,
	`change_amount` real NOT NULL,
	`change_percent` real NOT NULL,
	`raw_weekday` text NOT NULL,
	PRIMARY KEY(`symbol`, `adj_type`, `trade_date`)
);
--> statement-breakpoint
CREATE TABLE `trading_calendar` (
	`exchange` text NOT NULL,
	`trade_date` text NOT NULL,
	`is_open` integer NOT NULL,
	PRIMARY KEY(`exchange`, `trade_date`)
);
