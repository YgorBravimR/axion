"use client"

import { useState, useCallback, useMemo } from "react"
import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Copy,
	Plus,
	Pencil,
	AlertCircle,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { MonthlyPlanForm } from "./monthly-plan-form"
import { MonthlyPlanSummary } from "./monthly-plan-summary"
import { useFormatting } from "@/hooks/use-formatting"
import { fromCents } from "@/lib/money"
import {
	upsertMonthlyPlan,
	getMonthlyPlan,
	rolloverMonthlyPlan,
} from "@/app/actions/monthly-plans"
import { getMaxAllowedPlanMonth } from "@/lib/monthly-plan-date-guard"
import type { MonthlyPlan } from "@/db/schema"
import type { RiskManagementProfile } from "@/types/risk-profile"

interface MonthlyPlanTabProps {
	initialPlan: MonthlyPlan | null
	initialYear: number
	initialMonth: number
	riskProfiles?: RiskManagementProfile[]
}

export const MonthlyPlanTab = ({
	initialPlan,
	initialYear,
	initialMonth,
	riskProfiles = [],
}: MonthlyPlanTabProps) => {
	const t = useTranslations("commandCenter.plan")
	const tMonths = useTranslations("months")
	const { formatCurrency } = useFormatting()

	const [plan, setPlan] = useState<MonthlyPlan | null>(initialPlan)
	const [year, setYear] = useState(initialYear)
	const [month, setMonth] = useState(initialMonth)
	const [isEditing, setIsEditing] = useState(!initialPlan)
	const [loading, setLoading] = useState(false)

	const isCurrentMonth = year === initialYear && month === initialMonth

	const isNextMonthDisabled = useMemo(() => {
		const { maxYear, maxMonth } = getMaxAllowedPlanMonth()
		if (year > maxYear) return true
		if (year === maxYear && month >= maxMonth) return true
		return false
	}, [year, month])

	const handleNavigateMonth = useCallback(async (direction: -1 | 1) => {
		let newMonth = month + direction
		let newYear = year
		if (newMonth < 1) {
			newMonth = 12
			newYear--
		} else if (newMonth > 12) {
			newMonth = 1
			newYear++
		}

		setYear(newYear)
		setMonth(newMonth)
		setLoading(true)

		try {
			const result = await getMonthlyPlan({ year: newYear, month: newMonth })
			if (result.status === "success") {
				setPlan(result.data ?? null)
				setIsEditing(!result.data)
			}
		} finally {
			setLoading(false)
		}
	}, [month, year])

	const handleSave = useCallback(async (data: Parameters<typeof upsertMonthlyPlan>[0] extends infer T ? T : never) => {
		const result = await upsertMonthlyPlan(data)
		if (result.status === "success" && result.data) {
			setPlan(result.data)
			setIsEditing(false)
		}
	}, [])

	const handleCopyFromLastMonth = useCallback(async () => {
		setLoading(true)
		try {
			const result = await rolloverMonthlyPlan(null)
			if (result.status === "success" && result.data) {
				setPlan(result.data)
				setIsEditing(false)
			}
		} finally {
			setLoading(false)
		}
	}, [])

	const monthLabel = `${tMonths(String(month - 1))} ${year}`

	return (
		<div className="space-y-m-500">
			{/* Month Navigation Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-s-200">
					<CalendarDays className="h-5 w-5 text-acc-100" />
					<h3 className="text-body font-semibold text-txt-100">{t("title")}</h3>
				</div>

				<div className="flex items-center gap-s-200">
					<Button id="plan-previous-month"
						variant="ghost"
						size="icon"
						onClick={() => handleNavigateMonth(-1)}
						disabled={loading}
						aria-label={t("previousMonth")}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="min-w-[140px] text-center text-small font-medium text-txt-100">
						{monthLabel}
					</span>
					<Button id="plan-next-month"
						variant="ghost"
						size="icon"
						onClick={() => handleNavigateMonth(1)}
						disabled={loading || isNextMonthDisabled}
						aria-label={t("nextMonth")}
						title={isNextMonthDisabled ? t("futurePlanBlocked") : undefined}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>

				{/* Action buttons */}
				<div className="flex items-center gap-s-200">
					{plan && !isEditing && (
						<Button id="plan-edit"
							variant="outline"
							size="sm"
							onClick={() => setIsEditing(true)}
							aria-label={t("editPlan")}
						>
							<Pencil className="mr-s-100 h-3.5 w-3.5" />
							{t("editPlan")}
						</Button>
					)}
				</div>
			</div>

			{/* New Month Banner */}
			{!plan && !loading && isCurrentMonth && (
				<div className="flex items-center gap-m-400 rounded-lg border border-acc-100/30 bg-acc-100/5 p-m-400">
					<AlertCircle className="h-5 w-5 shrink-0 text-acc-100" />
					<div className="flex-1">
						<p className="text-small font-medium text-txt-100">
							{t("newMonthBanner", { month: tMonths(String(month - 1)), year: String(year) })}
						</p>
						<p className="text-tiny text-txt-300">{t("noPlanPrompt")}</p>
					</div>
					<div className="flex gap-s-200">
						<Button id="plan-copy-from-last-month"
							variant="outline"
							size="sm"
							onClick={handleCopyFromLastMonth}
							disabled={loading}
							aria-label={t("copyFromLastMonth")}
						>
							<Copy className="mr-s-100 h-3.5 w-3.5" />
							{t("copyFromLastMonth")}
						</Button>
						<Button id="plan-create"
							size="sm"
							onClick={() => setIsEditing(true)}
							aria-label={t("createPlan")}
						>
							<Plus className="mr-s-100 h-3.5 w-3.5" />
							{t("createPlan")}
						</Button>
					</div>
				</div>
			)}

			{/* No plan, not current month */}
			{!plan && !loading && !isCurrentMonth && (
				<div className="rounded-lg border border-bg-300 bg-bg-200 p-m-500 text-center">
					<p className="text-small text-txt-300">{t("noPlan")}</p>
				</div>
			)}

			{/* Loading */}
			{loading && (
				<div className="flex items-center justify-center py-8">
					<div className="h-6 w-6 animate-spin rounded-full border-2 border-acc-100 border-t-transparent" />
				</div>
			)}

			{/* Content: Form or Summary */}
			{!loading && isEditing && (
				<MonthlyPlanForm
					plan={plan}
					onSave={handleSave}
					year={year}
					month={month}
					riskProfiles={riskProfiles}
				/>
			)}

			{!loading && plan && !isEditing && (
				<MonthlyPlanSummary
					plan={plan}
					profileName={plan.riskProfileId
						? riskProfiles.find((p) => p.id === plan.riskProfileId)?.name ?? null
						: null}
				/>
			)}
		</div>
	)
}
