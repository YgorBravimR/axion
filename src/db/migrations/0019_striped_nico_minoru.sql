CREATE TYPE "public"."trade_rating" AS ENUM('A', 'B', 'C', 'D', 'F');--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "rating" "trade_rating";