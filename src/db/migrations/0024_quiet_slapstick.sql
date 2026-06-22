CREATE TABLE "ai_assistant_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"allowed_roles" jsonb DEFAULT '["admin"]'::jsonb NOT NULL,
	"allowed_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_surfaces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"monthly_cost_cap_cents" integer DEFAULT 500 NOT NULL,
	"last_change_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "ai_assistant_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"surface" text NOT NULL,
	"context_ref_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_assistant_daily_rollup" (
	"date" text PRIMARY KEY NOT NULL,
	"messages_total" integer DEFAULT 0 NOT NULL,
	"messages_by_surface" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"violations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"feedback" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"p50_latency_ms" integer,
	"p95_latency_ms" integer,
	"active_users" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_assistant_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"category" text,
	"free_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_assistant_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_cents" integer,
	"latency_ms" integer,
	"validator_verdicts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_assistant_usage" (
	"user_id" uuid NOT NULL,
	"year_month" text NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"tokens_in" bigint DEFAULT 0 NOT NULL,
	"tokens_out" bigint DEFAULT 0 NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_assistant_usage_user_id_year_month_pk" PRIMARY KEY("user_id","year_month")
);
--> statement-breakpoint
CREATE TABLE "ai_assistant_violations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"snippet" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_assistant_conversations" ADD CONSTRAINT "ai_assistant_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assistant_conversations" ADD CONSTRAINT "ai_assistant_conversations_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assistant_feedback" ADD CONSTRAINT "ai_assistant_feedback_message_id_ai_assistant_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_assistant_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assistant_feedback" ADD CONSTRAINT "ai_assistant_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assistant_messages" ADD CONSTRAINT "ai_assistant_messages_conversation_id_ai_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assistant_usage" ADD CONSTRAINT "ai_assistant_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assistant_violations" ADD CONSTRAINT "ai_assistant_violations_message_id_ai_assistant_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_assistant_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_assistant_conversations_user_created_idx" ON "ai_assistant_conversations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_assistant_conversations_context_idx" ON "ai_assistant_conversations" USING btree ("surface","context_ref_id");--> statement-breakpoint
CREATE INDEX "ai_assistant_feedback_message_idx" ON "ai_assistant_feedback" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ai_assistant_messages_conversation_created_idx" ON "ai_assistant_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_assistant_violations_kind_created_idx" ON "ai_assistant_violations" USING btree ("kind","created_at");