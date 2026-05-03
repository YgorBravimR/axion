CREATE TABLE "account_monthly_aggregate" (
	"account_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"month" smallint NOT NULL,
	"gross_cents" bigint DEFAULT 0 NOT NULL,
	"net_cents" bigint DEFAULT 0 NOT NULL,
	"points" numeric(12, 2) DEFAULT '0' NOT NULL,
	"trading_days" smallint DEFAULT 0 NOT NULL,
	"gain_days" smallint DEFAULT 0 NOT NULL,
	"loss_days" smallint DEFAULT 0 NOT NULL,
	"is_dirty" boolean DEFAULT true NOT NULL,
	"computed_at" timestamp with time zone,
	CONSTRAINT "account_monthly_aggregate_account_id_year_month_pk" PRIMARY KEY("account_id","year","month")
);
--> statement-breakpoint
CREATE TABLE "account_weekly_aggregate" (
	"account_id" uuid NOT NULL,
	"iso_year" smallint NOT NULL,
	"iso_week" smallint NOT NULL,
	"gross_cents" bigint DEFAULT 0 NOT NULL,
	"net_cents" bigint DEFAULT 0 NOT NULL,
	"points" numeric(12, 2) DEFAULT '0' NOT NULL,
	"trading_days" smallint DEFAULT 0 NOT NULL,
	"gain_days" smallint DEFAULT 0 NOT NULL,
	"loss_days" smallint DEFAULT 0 NOT NULL,
	"is_dirty" boolean DEFAULT true NOT NULL,
	"computed_at" timestamp with time zone,
	CONSTRAINT "account_weekly_aggregate_account_id_iso_year_iso_week_pk" PRIMARY KEY("account_id","iso_year","iso_week")
);
--> statement-breakpoint
ALTER TABLE "account_monthly_aggregate" ADD CONSTRAINT "account_monthly_aggregate_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_weekly_aggregate" ADD CONSTRAINT "account_weekly_aggregate_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;