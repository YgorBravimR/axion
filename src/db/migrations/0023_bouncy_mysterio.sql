CREATE TABLE "indicator_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_groups_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "indicator_definitions" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "indicator_definitions" ADD CONSTRAINT "indicator_definitions_group_id_indicator_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."indicator_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indicator_definitions_group_idx" ON "indicator_definitions" USING btree ("group_id");