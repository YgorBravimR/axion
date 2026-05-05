ALTER TABLE "monthly_plans" RENAME TO "monthly_risk_config";
ALTER INDEX "monthly_plans_pkey" RENAME TO "monthly_risk_config_pkey";
ALTER INDEX "monthly_plans_account_idx" RENAME TO "monthly_risk_config_account_idx";
ALTER INDEX "monthly_plans_account_year_month_idx" RENAME TO "monthly_risk_config_account_year_month_idx";
ALTER TABLE "monthly_risk_config" RENAME CONSTRAINT "monthly_plans_account_id_trading_accounts_id_fk" TO "monthly_risk_config_account_id_trading_accounts_id_fk";
ALTER TABLE "monthly_risk_config" RENAME CONSTRAINT "monthly_plans_risk_profile_id_risk_management_profiles_id_fk" TO "monthly_risk_config_risk_profile_id_fk";

