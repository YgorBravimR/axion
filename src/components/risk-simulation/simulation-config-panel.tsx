"use client"

import { useTranslations } from "next-intl"
import type { DateRange } from "react-day-picker"
import { DateRangePicker } from "@/components/ui/date-range-picker"
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

	return (
		<div className="border-bg-300 bg-bg-200 space-y-m-400 rounded-lg border p-s-300 sm:p-m-400">
			{/* Date Range */}
			<div>
				<h3 className="text-small text-txt-100 mb-s-300 font-semibold">
					{t("dateRange")}
				</h3>
				<DateRangePicker
					id="sim-date-range"
					value={rangeValue}
					onChange={handleRangeChange}
					className="max-w-sm"
				/>
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
