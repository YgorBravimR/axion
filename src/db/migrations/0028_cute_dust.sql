CREATE TABLE "weekly_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"yearly_plan_id" uuid NOT NULL,
	"iso_week" integer NOT NULL,
	"iso_year" integer NOT NULL,
	"contracts" integer DEFAULT 1 NOT NULL,
	"valor_operacional_cents" integer NOT NULL,
	"pts_alvo" numeric(8, 2),
	"pts_feito" numeric(8, 2),
	"pts_source" varchar(10) DEFAULT 'manual',
	"meta_bruto_cents" integer,
	"meta_liquido_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yearly_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"initial_capital_cents" integer NOT NULL,
	"valor_por_contrato_cents" integer DEFAULT 300000 NOT NULL,
	"ir_tax_rate" numeric(5, 2) DEFAULT '30.00' NOT NULL,
	"trading_days_per_week" integer DEFAULT 5 NOT NULL,
	"ladder_rules" jsonb NOT NULL,
	"exit_parcial_pts" numeric(6, 2) DEFAULT '5.00' NOT NULL,
	"exit_final_pts" numeric(6, 2) DEFAULT '10.00' NOT NULL,
	"exit_stop_pts" numeric(6, 2) DEFAULT '3.50' NOT NULL,
	"exit_prot_pts" numeric(6, 2) DEFAULT '1.00' NOT NULL,
	"exit_parcial_proportion" numeric(4, 3) DEFAULT '0.700' NOT NULL,
	"exit_final_proportion" numeric(4, 3) DEFAULT '0.300' NOT NULL,
	"start_week" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_targets" ADD CONSTRAINT "weekly_targets_yearly_plan_id_yearly_plans_id_fk" FOREIGN KEY ("yearly_plan_id") REFERENCES "public"."yearly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD CONSTRAINT "yearly_plans_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_targets_plan_idx" ON "weekly_targets" USING btree ("yearly_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_targets_plan_week_idx" ON "weekly_targets" USING btree ("yearly_plan_id","iso_week","iso_year");--> statement-breakpoint
CREATE INDEX "yearly_plans_account_idx" ON "yearly_plans" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "yearly_plans_account_year_idx" ON "yearly_plans" USING btree ("account_id","year");