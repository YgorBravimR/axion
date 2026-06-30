CREATE TABLE "hawks_chart_drawings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"payload" jsonb NOT NULL,
	"label" text,
	"color" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hawks_chart_drawings" ADD CONSTRAINT "hawks_chart_drawings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hawks_chart_drawings" ADD CONSTRAINT "hawks_chart_drawings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hawks_chart_drawings_user_asset_idx" ON "hawks_chart_drawings" USING btree ("user_id","asset_id");