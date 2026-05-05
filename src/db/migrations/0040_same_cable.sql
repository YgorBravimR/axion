ALTER TABLE "daily_plan" ADD COLUMN "override_max_consecutive_losses" integer;--> statement-breakpoint
ALTER TABLE "daily_plan" ADD COLUMN "override_allow_second_op_after_loss" boolean;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "override_risk_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "override_max_consecutive_losses" integer;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "override_allow_second_op_after_loss" boolean;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "override_reduce_risk_after_loss" boolean;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "override_risk_reduction_factor" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "override_increase_risk_after_win" boolean;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "override_cap_risk_after_win" boolean;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "override_profit_reinvestment_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "weekly_plan" ADD COLUMN "override_max_consecutive_losses" integer;--> statement-breakpoint
ALTER TABLE "weekly_plan" ADD COLUMN "override_allow_second_op_after_loss" boolean;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_risk_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_max_consecutive_losses" integer;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_allow_second_op_after_loss" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_reduce_risk_after_loss" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_risk_reduction_factor" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_increase_risk_after_win" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_cap_risk_after_win" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD COLUMN "default_profit_reinvestment_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD CONSTRAINT "monthly_plan_override_risk_profile_fk" FOREIGN KEY ("override_risk_profile_id") REFERENCES "public"."risk_management_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD CONSTRAINT "yearly_plans_default_risk_profile_fk" FOREIGN KEY ("default_risk_profile_id") REFERENCES "public"."risk_management_profiles"("id") ON DELETE set null ON UPDATE no action;