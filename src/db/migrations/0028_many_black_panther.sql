CREATE TYPE "public"."be_outcome" AS ENUM('be_killed_runner', 'be_saved_stop', 'be_neutral', 'not_be');--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "be_outcome" "be_outcome";