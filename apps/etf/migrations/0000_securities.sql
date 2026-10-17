CREATE TABLE `securities` (
	`symbol` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`asset_type` text NOT NULL,
	`exchange` text NOT NULL,
	`currency` text NOT NULL,
	`source` text NOT NULL,
	`earliest_trade_date` text NOT NULL
);
