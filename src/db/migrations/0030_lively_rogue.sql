CREATE TYPE "public"."darf_status" AS ENUM('pending', 'paid', 'exempt', 'overdue');--> statement-breakpoint
CREATE TABLE "account_fee_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"asset_symbol" varchar(20),
	"tx_corretagem_cents" integer DEFAULT 5 NOT NULL,
	"tx_registro_cents" integer DEFAULT 74 NOT NULL,
	"emolumentos_cents" integer DEFAULT 40 NOT NULL,
	"iss_rate_percent" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"irrf_rate_bps" integer DEFAULT 100 NOT NULL,
	"ir_rate_bps" integer DEFAULT 2000 NOT NULL,
	"subject_to_personal_ir" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_tax_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"month" timestamp with time zone NOT NULL,
	"gross_gain_cents" bigint DEFAULT 0 NOT NULL,
	"total_tx_corretagem_cents" bigint DEFAULT 0 NOT NULL,
	"total_tx_registro_cents" bigint DEFAULT 0 NOT NULL,
	"total_emolumentos_cents" bigint DEFAULT 0 NOT NULL,
	"total_iss_cents" bigint DEFAULT 0 NOT NULL,
	"total_fees_cents" bigint DEFAULT 0 NOT NULL,
	"total_contracts_executed" numeric(20, 4) DEFAULT '0' NOT NULL,
	"irrf_cents" bigint DEFAULT 0 NOT NULL,
	"net_gain_before_carryover_cents" bigint DEFAULT 0 NOT NULL,
	"carryover_in_cents" bigint DEFAULT 0 NOT NULL,
	"carryover_consumed_cents" bigint DEFAULT 0 NOT NULL,
	"carryover_out_cents" bigint DEFAULT 0 NOT NULL,
	"taxable_gain_cents" bigint DEFAULT 0 NOT NULL,
	"ir_gross_cents" bigint DEFAULT 0 NOT NULL,
	"darf_due_cents" bigint DEFAULT 0 NOT NULL,
	"darf_status" "darf_status" DEFAULT 'pending' NOT NULL,
	"darf_due_date" timestamp with time zone,
	"darf_paid_at" timestamp with time zone,
	"darf_paid_amount_cents" bigint,
	"previous_balance_cents" bigint DEFAULT 0 NOT NULL,
	"gastos_gerais_cents" bigint DEFAULT 0 NOT NULL,
	"net_liquid_cents" bigint DEFAULT 0 NOT NULL,
	"is_dirty" boolean DEFAULT true NOT NULL,
	"computed_at" timestamp with time zone,
	"trade_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_fee_rates" ADD CONSTRAINT "account_fee_rates_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_tax_ledger" ADD CONSTRAINT "monthly_tax_ledger_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_fee_rates_account_idx" ON "account_fee_rates" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_fee_rates_account_asset_idx" ON "account_fee_rates" USING btree ("account_id","asset_symbol");--> statement-breakpoint
CREATE INDEX "monthly_tax_ledger_account_idx" ON "monthly_tax_ledger" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_tax_ledger_account_month_idx" ON "monthly_tax_ledger" USING btree ("account_id","month");--> statement-breakpoint
CREATE INDEX "monthly_tax_ledger_darf_status_idx" ON "monthly_tax_ledger" USING btree ("darf_status");--> statement-breakpoint
CREATE INDEX "monthly_tax_ledger_dirty_idx" ON "monthly_tax_ledger" USING btree ("is_dirty");