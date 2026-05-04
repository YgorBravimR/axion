ALTER TABLE "yearly_plans" ADD COLUMN "default_daily_loss_r" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_daily_win_r" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_weekly_loss_r" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_weekly_win_r" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_monthly_loss_r" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_monthly_win_r" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "target_months_to_yearly" integer;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "target_weeks_to_yearly" integer;