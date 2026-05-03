ALTER TABLE "trading_accounts" ADD COLUMN "account_start_month" smallint;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD COLUMN "account_start_year" smallint;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD COLUMN "starting_balance_cents" bigint;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD COLUMN "withdrawal_target_percent" numeric(5, 2) DEFAULT '30.00';