"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import type { DateRange } from "react-day-picker"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Play, Info } from "lucide-react"
import type { EquityShieldParams } from "@/types/equity-shield"
import { toCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"

// ==========================================
// TYPES
// ==========================================

interface EquityShieldPreview {
	totalTrades: number
	hasEnoughTrades: boolean
}

interface EquityShieldParamsProps {
	params: EquityShieldParams
	onParamsChange: (params: EquityShieldParams) => void
	dateFrom: string
	dateTo: string
	onDateChange: (from: string, to: string) => void
	tradeYears: number[]
	preview: EquityShieldPreview | null
	isLoadingPreview: boolean
	onRun: () => void
	isLoading: boolean
}

// ==========================================
// DATE HELPERS
// ==========================================

/** Convert YYYY-MM-DD string to Date at noon (avoids timezone shift) */
const parseToDate = (dateStr: string): Date | undefined => {
	if (!dateStr) {
		return undefined
	}
	return new Date(dateStr + "T12:00:00")
}

/** Convert Date to YYYY-MM-DD string (manual extraction avoids UTC offset bugs) */
const formatToDateStr = (date: Date): string => {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

// ==========================================
// COMPONENT
// ==========================================

const EquityShieldParamsForm = ({
	params,
	onParamsChange,
	dateFrom,
	dateTo,
	onDateChange,
	tradeYears,
	preview,
	isLoadingPreview,
	onRun,
	isLoading,
}: EquityShieldParamsProps) => {
	const t = useTranslations("equityShield.params")

	const handleFieldChange = (
		field: keyof EquityShieldParams,
		rawValue: string
	) => {
		const value = parseFloat(rawValue)
		if (Number.isNaN(value)) {
			return
		}

		if (field === "initialBalanceCents" || field === "drawdownLimitCents") {
			onParamsChange({ ...params, [field]: toCents(value) })
		} else {
			onParamsChange({ ...params, [field]: value })
		}
	}

	// Date range picker bridge
	const rangeValue = useMemo<DateRange | undefined>(
		() =>
			dateFrom || dateTo
				? { from: parseToDate(dateFrom), to: parseToDate(dateTo) }
				: undefined,
		[dateFrom, dateTo]
	)

	const handleRangeChange = (range: DateRange | undefined) => {
		const from = range?.from ? formatToDateStr(range.from) : ""
		const to = range?.to ? formatToDateStr(range.to) : ""
		onDateChange(from, to)
	}

	const handleYearSelect = (year: string) => {
		onDateChange(`${year}-01-01`, `${year}-12-31`)
	}

	const handleAllTime = () => {
		const oldest = tradeYears[tradeYears.length - 1]
		if (oldest === undefined) {
			return
		}
		onDateChange(`${oldest}-01-01`, formatDateKey(new Date()))
	}

	const activeQuickFilter = useMemo(() => {
		if (!dateFrom || !dateTo) {
			return null
		}
		for (const year of tradeYears) {
			if (dateFrom === `${year}-01-01` && dateTo === `${year}-12-31`) {
				return `year-${year}`
			}
		}
		if (tradeYears.length > 0) {
			const oldest = tradeYears[tradeYears.length - 1]
			const today = new Date().toISOString().split("T")[0]
			if (dateFrom === `${oldest}-01-01` && dateTo === today) {
				return "all"
			}
		}
		return null
	}, [dateFrom, dateTo, tradeYears])

	return (
		<div className="border-bg-300 bg-bg-200 space-y-m-400 p-s-300 sm:p-m-400 rounded-lg border">
			<h2 className="text-body sm:text-h3 text-txt-100 font-semibold">
				{t("title")}
			</h2>

			{/* Date Range Section */}
			<div className="space-y-s-300">
				<Label id="label-date-range" className="text-tiny text-txt-300">
					{t("dateRange")}
				</Label>
				<div className="gap-s-300 flex flex-wrap items-end">
					<DateRangePicker
						id="shield-date-range"
						value={rangeValue}
						onChange={handleRangeChange}
						className="w-full sm:max-w-sm"
					/>
					{tradeYears.length > 0 && (
						<div className="gap-s-200 flex items-center">
							<Select
								value={
									activeQuickFilter?.startsWith("year-")
										? activeQuickFilter.replace("year-", "")
										: ""
								}
								onValueChange={handleYearSelect}
							>
								<SelectTrigger
									id="shield-year-filter"
									size="sm"
									className="w-full max-w-[100px] min-w-0"
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
								id="btn-shield-all-time"
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

			{/* Preview Banner */}
			{isLoadingPreview && (
				<div className="bg-bg-100 border-bg-300 p-s-300 rounded-md border">
					<p className="text-small text-txt-300 animate-pulse motion-reduce:animate-none">
						{t("preview.loading")}
					</p>
				</div>
			)}
			{!isLoadingPreview && preview && (
				<div className="bg-bg-100 border-bg-300 p-s-300 rounded-md border">
					<p className="text-small text-txt-100">
						{t("preview.totalTrades", { count: preview.totalTrades })}
					</p>
					{!preview.hasEnoughTrades && preview.totalTrades > 0 && (
						<p className="text-tiny text-trade-sell mt-s-100">
							{t("preview.notEnoughTrades")}
						</p>
					)}
					{preview.totalTrades === 0 && (
						<p className="text-tiny text-txt-300 mt-s-100">
							{t("preview.noTrades")}
						</p>
					)}
				</div>
			)}

			{/* Tip about sample size */}
			<div className="bg-bg-100 border-bg-300 gap-s-200 p-s-300 flex items-start rounded-md border">
				<Info className="text-txt-300 mt-0.5 h-4 w-4 shrink-0" />
				<p className="text-tiny text-txt-300">{t("sampleSizeTip")}</p>
			</div>

			{/* Computation Parameters Grid */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
				{/* Account Balance */}
				<div className="space-y-s-200">
					<Label
						id="label-initial-balance"
						htmlFor="initial-balance"
						className="text-tiny text-txt-300"
					>
						{t("initialBalance")}
					</Label>
					<Input
						id="initial-balance"
						type="number"
						min={0}
						step={100}
						value={params.initialBalanceCents / 100}
						onChange={(e) =>
							handleFieldChange("initialBalanceCents", e.target.value)
						}
						aria-label={t("initialBalance")}
					/>
				</div>

				{/* DD Limit */}
				<div className="space-y-s-200">
					<Label
						id="label-dd-limit"
						htmlFor="dd-limit"
						className="text-tiny text-txt-300"
					>
						{t("drawdownLimit")}
					</Label>
					<Input
						id="dd-limit"
						type="number"
						min={0}
						step={100}
						value={params.drawdownLimitCents / 100}
						onChange={(e) =>
							handleFieldChange("drawdownLimitCents", e.target.value)
						}
						aria-label={t("drawdownLimit")}
					/>
				</div>

				{/* MDD Multiplier */}
				<div className="space-y-s-200">
					<Label
						id="label-mdd-multiplier"
						htmlFor="mdd-multiplier"
						className="text-tiny text-txt-300"
					>
						{t("mddMultiplier")}
					</Label>
					<Input
						id="mdd-multiplier"
						type="number"
						min={1}
						max={3}
						step={0.1}
						value={params.mddMultiplier}
						onChange={(e) => handleFieldChange("mddMultiplier", e.target.value)}
						aria-label={t("mddMultiplier")}
					/>
				</div>

				{/* Recovery % */}
				<div className="space-y-s-200">
					<Label
						id="label-recovery-percent"
						htmlFor="recovery-percent"
						className="text-tiny text-txt-300"
					>
						{t("recoveryPercent")}
					</Label>
					<Input
						id="recovery-percent"
						type="number"
						min={5}
						max={100}
						step={5}
						value={params.recoveryPercent * 100}
						onChange={(e) =>
							handleFieldChange(
								"recoveryPercent",
								String(parseFloat(e.target.value) / 100)
							)
						}
						aria-label={t("recoveryPercent")}
					/>
				</div>

				{/* SMA Period */}
				<div className="space-y-s-200">
					<Label
						id="label-sma-period"
						htmlFor="sma-period"
						className="text-tiny text-txt-300"
					>
						{t("smaPeriod")}
					</Label>
					<Input
						id="sma-period"
						type="number"
						min={3}
						max={50}
						step={1}
						value={params.smaPeriod}
						onChange={(e) => handleFieldChange("smaPeriod", e.target.value)}
						aria-label={t("smaPeriod")}
					/>
				</div>
			</div>

			{/* Cut at DD Limit toggle */}
			<div className="gap-s-300 flex items-center">
				<Switch
					id="cut-at-dd-limit"
					checked={params.cutAtDdLimit}
					onCheckedChange={(checked) =>
						onParamsChange({ ...params, cutAtDdLimit: checked })
					}
					aria-label={t("cutAtDdLimit")}
				/>
				<Label
					id="label-cut-at-dd"
					htmlFor="cut-at-dd-limit"
					className="text-tiny text-txt-300 cursor-pointer"
				>
					{t("cutAtDdLimit")}
				</Label>
				<span className="text-tiny text-txt-300 opacity-60">
					{t("cutAtDdLimitHint")}
				</span>
			</div>

			{/* Run button */}
			<div className="flex justify-end">
				<Button
					id="run-equity-shield"
					onClick={onRun}
					disabled={isLoading}
					className="gap-s-200"
					aria-label={t("runAnalysis")}
				>
					<Play className="h-4 w-4" />
					{isLoading ? t("running") : t("runAnalysis")}
				</Button>
			</div>
		</div>
	)
}

export { EquityShieldParamsForm }
