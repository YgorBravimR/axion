CREATE TABLE "trade_conditions" (
	"trade_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"met" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_conditions_trade_id_condition_id_pk" PRIMARY KEY("trade_id","condition_id")
);
--> statement-breakpoint
ALTER TABLE "trade_conditions" ADD CONSTRAINT "trade_conditions_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_conditions" ADD CONSTRAINT "trade_conditions_condition_id_trading_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."trading_conditions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_conditions_condition_idx" ON "trade_conditions" USING btree ("condition_id");