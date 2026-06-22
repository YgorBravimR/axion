CREATE TABLE "weekly_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"lesson" text,
	"rule_change" text,
	"focus_next_week" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_review" ADD CONSTRAINT "weekly_review_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_review_account_year_week_idx" ON "weekly_review" USING btree ("account_id","iso_year","iso_week");