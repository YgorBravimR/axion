CREATE TYPE "public"."user_role" AS ENUM('admin', 'trader', 'viewer');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'trader' NOT NULL;--> statement-breakpoint
UPDATE "users" SET "role" = 'admin' WHERE "is_admin" = true;--> statement-breakpoint
UPDATE "users" SET "role" = 'trader' WHERE "is_admin" = false;