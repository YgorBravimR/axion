"use client"

import { useTranslations } from "next-intl"
import type { DateRange } from "react-day-picker"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Button } from "@/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { PrefillSelector } from "./prefill-selector"
import { RiskParamsForm } from "./risk-params-form"
import { PreviewBanner } from "./preview-banner"
import type { MonthlyPlan } from "@/db/schema"
import type { RiskManagementProfile } from "@/types/risk-profile"
import type {
	PrefillSource,
	AdvancedSimulationParams,
	RiskSimulationParams,
	SimulationPreview,
} from "@/types/risk-simulation"

interface SimulationConfigPanelProps {
	dateFrom: string
	dateTo: string
	onDateChange: (from: string, to: string) => void
	tradeYears: number[]
	params: RiskSimulationParams | null
	onParamsChange: (params: RiskSimulationParams) => void
	preview: SimulationPreview | null
	isLoadingPreview: boolean
	monthlyPlan: MonthlyPlan | null
	riskProfiles: RiskManagementProfile[]
	allTradesLackSl: boolean
	prefillSource: PrefillSource | null
	activeProfileId: string | null
	onPrefillSelect: (params: RiskSimulationParams, source: PrefillSource, profileId?: string) => void
	isLocked: boolean
	originalAdvancedParams: AdvancedSimulationParams | null
}

/**
 * Convert a YYYY-MM-DD string to a Date at noon (avoids timezone-shift issues).
 */
const parseToDate = (dateStr: string): Date | undefined => {
	if (!dateStr) return undefined
	return new Date(dateStr + "T12:00:00")
}

/**
 * Convert a Date to a YYYY-MM-DD string.
 */
const formatToDateStr = (date: Date): string => {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

const SimulationConfigPanel = ({
	dateFrom,
	dateTo,
	onDateChange,
	tradeYears,
	params,
	onParamsChange,
	preview,
	isLoadingPreview,
	monthlyPlan,
	riskProfiles,
	allTradesLackSl,
	prefillSource,
	activeProfileId,
	onPrefillSelect,
	isLocked,
	originalAdvancedParams,
}: SimulationConfigPanelProps) => {
	const t = useTranslations("riskSimulation.config")

	const rangeValue: DateRange | undefined =
		dateFrom || dateTo
			? { from: parseToDate(dateFrom), to: parseToDate(dateTo) }
			: undefined

	const handleRangeChange = (range: DateRange | undefined) => {
		const from = range?.from ? formatToDateStr(range.from) : ""
		const to = range?.to ? formatToDateStr(range.to) : ""
		onDateChange(from, to)
	}

	const handleYearSelect = (year: string) => {
		onDateChange(`${year}-01-01`, `${year}-12-31`)
	}

	const handleAllTime = () => {
		if (tradeYears.length === 0) return
		const oldest = tradeYears[tradeYears.length - 1]
		onDateChange(`${oldest}-01-01`, new Date().toISOString().split("T")[0])
	}

	/** Derive which quick filter is currently active based on dateFrom/dateTo */
	const activeQuickFilter = (() => {
		if (!dateFrom || !dateTo) return null

		// Check if a year filter matches
		for (const year of tradeYears) {
			if (dateFrom === `${year}-01-01` && dateTo === `${year}-12-31`) {
				return `year-${year}`
			}
		}

		// Check if "all" matches
		if (tradeYears.length > 0) {
			const oldest = tradeYears[tradeYears.length - 1]
			const today = new Date().toISOString().split("T")[0]
			if (dateFrom === `${oldest}-01-01` && dateTo === today) {
				return "all"
			}
		}

		return null
	})()

	return (
		<div className="border-bg-300 bg-bg-200 space-y-m-400 rounded-lg border p-s-300 sm:p-m-400">
			{/* Date Range */}
			<div>
				<h3 className="text-small text-txt-100 mb-s-300 font-semibold">
					{t("dateRange")}
				</h3>
				<div className="flex flex-wrap items-end gap-s-300">
					<DateRangePicker
						id="sim-date-range"
						value={rangeValue}
						onChange={handleRangeChange}
						className="w-full sm:max-w-sm"
					/>

					{tradeYears.length > 0 && (
						<div className="flex items-center gap-s-200">
							<Select
								value={activeQuickFilter?.startsWith("year-") ? activeQuickFilter.replace("year-", "") : ""}
								onValueChange={handleYearSelect}
							>
								<SelectTrigger
									id="sim-year-filter"
									size="sm"
									className="w-[100px]"
									aria-label={t("yearFilter")}
								>
									<SelectValue placeholder={t("yearFilter")} />
								</SelectTrigger>
								<SelectContent>
									{tradeYears.map((year) => (
										<SelectItem key={year} value={String(year)}>
											{year}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Button
								id="btn-all-time"
								variant={activeQuickFilter === "all" ? "default" : "outline"}
								size="sm"
								onClick={handleAllTime}
								aria-label={t("allTime")}
							>
								{t("allTime")}
							</Button>
						</div>
					)}
				</div>
			</div>

			{/* Preview */}
			{(preview || isLoadingPreview) && (
				<PreviewBanner
					preview={preview}
					isLoading={isLoadingPreview}
					allTradesLackSl={allTradesLackSl}
				/>
			)}

			{/* Prefill + Params */}
			{preview && preview.totalTrades > 0 && (
				<>
					<PrefillSelector
						monthlyPlan={monthlyPlan}
						riskProfiles={riskProfiles}
						onSelect={onPrefillSelect}
						activeSource={prefillSource}
						activeProfileId={activeProfileId}
					/>

					{params && (
						<RiskParamsForm
							params={params}
							onChange={onParamsChange}
							isLocked={isLocked}
							originalAdvancedParams={originalAdvancedParams}
						/>
					)}
				</>
			)}
		</div>
	)
}

export { SimulationConfigPanel }
