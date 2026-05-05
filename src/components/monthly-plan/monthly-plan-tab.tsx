"use client"

import { CalendarDays } from "lucide-react"
import { useTranslations } from "next-intl"
import type { MonthlyRiskConfig } from "@/db/schema"
import type { RiskManagementProfile } from "@/types/risk-profile"

interface MonthlyPlanTabProps {
	initialPlan: MonthlyRiskConfig | null
	initialYear: number
	initialMonth: number
	riskProfiles?: RiskManagementProfile[]
}

// Phase 4b: legacy monthlyRiskConfig table is being retired. The fractal-plan
// editor (Phase 5) replaces this tab.
export const MonthlyPlanTab = ({
	initialYear,
	initialMonth,
}: MonthlyPlanTabProps) => {
	const t = useTranslations("commandCenter.plan")
	const tMonths = useTranslations("months")

	return (
		<div className="space-y-m-500">
			<div className="flex items-center gap-s-200">
				<CalendarDays className="h-5 w-5 text-acc-100" />
				<h3 className="text-body font-semibold text-txt-100">{t("title")}</h3>
			</div>
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-m-500 text-center">
				<p className="text-small text-txt-200">
					{tMonths(String(initialMonth - 1))} {initialYear}
				</p>
				<p className="text-tiny text-txt-300 mt-s-200">
					Monthly plan editor is being migrated to the fractal-plan editor.
				</p>
			</div>
		</div>
	)
}
