ALTER TABLE "account_assets" DROP COLUMN "commission_override";--> statement-breakpoint
ALTER TABLE "account_assets" DROP COLUMN "fees_override";--> statement-breakpoint
ALTER TABLE "trading_accounts" DROP COLUMN "default_commission";--> statement-breakpoint
ALTER TABLE "trading_accounts" DROP COLUMN "default_fees";