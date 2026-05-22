CREATE TABLE "hawks_renko_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_date" date NOT NULL,
	"week_number" smallint NOT NULL,
	"size_5m" smallint NOT NULL,
	"size_15m" smallint NOT NULL,
	"size_60m" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hawks_renko_sizes_effective_date_unique" UNIQUE("effective_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "hawks_renko_sizes_date_idx" ON "hawks_renko_sizes" USING btree ("effective_date");