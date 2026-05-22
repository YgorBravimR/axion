-- Replay account mode deprecated. Convert any pre-existing replay accounts
-- to 'personal' before tightening the enum, otherwise the recast at the end
-- of this migration would fail on rows where account_type = 'replay'.
ALTER TABLE "trading_accounts" ALTER COLUMN "account_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "trading_accounts" ALTER COLUMN "account_type" SET DEFAULT 'personal'::text;--> statement-breakpoint
UPDATE "trading_accounts" SET "account_type" = 'personal' WHERE "account_type" = 'replay';--> statement-breakpoint
DROP TYPE "public"."account_type";--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('personal', 'prop');--> statement-breakpoint
ALTER TABLE "trading_accounts" ALTER COLUMN "account_type" SET DEFAULT 'personal'::"public"."account_type";--> statement-breakpoint
ALTER TABLE "trading_accounts" ALTER COLUMN "account_type" SET DATA TYPE "public"."account_type" USING "account_type"::"public"."account_type";--> statement-breakpoint
ALTER TABLE "trading_accounts" DROP COLUMN "replay_current_date";