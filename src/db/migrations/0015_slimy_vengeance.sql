CREATE TABLE "asset_session_anchors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"date" date NOT NULL,
	"payload" jsonb NOT NULL,
	"source" varchar(20) DEFAULT 'imported' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_session_anchors" ADD CONSTRAINT "asset_session_anchors_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_session_anchors_asset_date_idx" ON "asset_session_anchors" USING btree ("asset_id","date");--> statement-breakpoint
CREATE INDEX "asset_session_anchors_date_idx" ON "asset_session_anchors" USING btree ("date");