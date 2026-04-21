"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import type { DateRange } from "react-day-picker"
import { useToast } from "@/components/ui/toast"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import { Play, RotateCcw } from "lucide-react"
import { runBacktestAction } from "@/app/actions/backtest"
import { orbPresets } from "@/lib/backtest/presets/orb-presets"
import { dezkPresets } from "@/lib/backtest/presets/dezk-presets"
import { OrbEntrySection } from "./sections/orb-entry-section"
import { DezkEntrySection } from "./sections/dezk-entry-section"
import { StopProtectionSection } from "./sections/stop-protection-section"
import { TargetsExitSection } from "./sections/targets-exit-section"
import { SizingExecutionSection } from "./sections/sizing-execution-section"
import { BacktestSummaryCards } from "./backtest-summary-cards"
import { BacktestEquityChart } from "./backtest-equity-chart"
import { BacktestTradesTable } from "./backtest-trades-table"
import type { DataSourceInfo } from "@/types/candle"
import type { BacktestResult, StrategyRecipe } from "@/types/backtest"

interface BacktestContentProps {
	dataSources: DataSourceInfo[]
}

const BacktestContent = ({ dataSources }: BacktestContentProps) => {
	const t = useTranslations("backtest")
	const { showToast } = useToast()
	const { showLoading, hideLoading } = useLoadingOverlay()
	const [isPending, startTransition] = useTransition()

	// Config state
	const [recipe, setRecipe] = useState<StrategyRecipe>(orbPresets[0])
	const [selectedSourceIndex, setSelectedSourceIndex] = useState<number>(0)
	const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
	const [quickRangeKey, setQuickRangeKey] = useState<string>("")
	const dateFrom = dateRange?.from ? dateRange.from.toISOString().slice(0, 10) : ""
	const dateTo = dateRange?.to ? dateRange.to.toISOString().slice(0, 10) : ""

	// Results state
	const [result, setResult] = useState<BacktestResult | null>(null)

	const selectedSource = dataSources[selectedSourceIndex]

	// Compute valuePerPoint from selected asset: tickValue / tickSize
	const assetValuePerPointCents = selectedSource
		? Math.round(selectedSource.assetTickValueCents / selectedSource.assetTickSize)
		: 20

	const allPresets = [...orbPresets, ...dezkPresets]

	const handlePresetChange = (value: string) => {
		const index = parseInt(value, 10)
		const preset = { ...allPresets[index] }
		// Auto-fill valuePerPoint from asset
		if (preset.sizing.type === "monetary_risk") {
			preset.sizing = { ...preset.sizing, valuePerPointCents: assetValuePerPointCents }
		}
		setRecipe(preset)
	}

	const handleStrategyChange = (type: string) => {
		if (type === "orb_breakout") {
			setRecipe(orbPresets[0])
		} else if (type === "macd_wma_alignment") {
			setRecipe(dezkPresets[0])
		}
	}

	const handleSourceChange = (value: string) => {
		const index = parseInt(value, 10)
		setSelectedSourceIndex(index)
		// Auto-update valuePerPoint in recipe when asset changes
		const source = dataSources[index]
		if (source && recipe.sizing.type === "monetary_risk") {
			const vpp = Math.round(source.assetTickValueCents / source.assetTickSize)
			setRecipe((prev) => ({
				...prev,
				sizing: prev.sizing.type === "monetary_risk"
					? { ...prev.sizing, valuePerPointCents: vpp }
					: prev.sizing,
			}))
		}
	}

	const handleQuickRange = (value: string) => {
		setQuickRangeKey(value)
		const now = new Date()
		let from: Date
		const to = now

		switch (value) {
			case "all":
				from = new Date("2020-01-01")
				break
			case "this_month":
				from = new Date(now.getFullYear(), now.getMonth(), 1)
				break
			case "this_year":
				from = new Date(now.getFullYear(), 0, 1)
				break
			case "3m":
				from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
				break
			case "6m":
				from = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
				break
			case "1y":
				from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
				break
			default:
				return
		}

		setDateRange({ from, to })
	}

	const handleDateRangeManual = (range: DateRange | undefined) => {
		setDateRange(range)
		setQuickRangeKey("custom")
	}

	const handleRun = () => {
		if (!selectedSource || !dateFrom || !dateTo) {
			showToast("error", "Select asset, timeframe, and date range")
			return
		}

		showLoading({
			message: t("config.running"),
			subMessage: `${selectedSource.assetSymbol} — ${selectedSource.timeframeCode}`,
		})

		startTransition(async () => {
			const response = await runBacktestAction({
				assetId: selectedSource.assetId,
				timeframeId: selectedSource.timeframeId,
				dateRange: { from: dateFrom, to: dateTo },
				recipe,
			})

			hideLoading()

			if (response.success && response.data) {
				setResult(response.data)
				showToast("success", `${response.data.summary.totalTrades} trades`)
			} else {
				showToast("error", response.error ?? t("errors.engineError"))
			}
		})
	}

	return (
		<div className="space-y-m-500">
			{/* Header */}
			<div>
				<h1 className="text-heading-2 font-semibold text-txt-100">{t("title")}</h1>
				<p className="text-body text-txt-200">{t("description")}</p>
			</div>

			{/* Section 1: Strategy & Data */}
			<div className="border-bg-300 bg-bg-200 space-y-m-400 rounded-lg border p-m-400">
				<h2 className="text-heading-3 font-semibold text-txt-100">{t("builder.strategyAndData")}</h2>
				{/* Row 1: Strategy, Asset, Preset */}
				<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-3">
					{/* Strategy */}
					<div className="space-y-s-200">
						<label className="text-small font-medium text-txt-200">{t("builder.strategy")}</label>
						<Select value={recipe.entry.type} onValueChange={handleStrategyChange}>
							<SelectTrigger id="backtest-strategy">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="orb_breakout">{t("orb.name")}</SelectItem>
								<SelectItem value="macd_wma_alignment">{t("dezk.name")}</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Asset + Timeframe */}
					<div className="space-y-s-200">
						<label className="text-small font-medium text-txt-200">
							{t("config.asset")} / {t("config.timeframe")}
						</label>
						<Select value={String(selectedSourceIndex)} onValueChange={handleSourceChange}>
							<SelectTrigger id="backtest-source">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{dataSources.map((source, i) => (
									<SelectItem key={`${source.assetId}-${source.timeframeId}`} value={String(i)}>
										{source.assetSymbol} — {source.timeframeCode}
										{source.rowCount ? ` (${source.rowCount.toLocaleString()})` : ""}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Load Preset */}
					<div className="space-y-s-200">
						<label className="text-small font-medium text-txt-200">{t("builder.loadPreset")}</label>
						<Select onValueChange={handlePresetChange}>
							<SelectTrigger id="backtest-preset">
								<SelectValue placeholder={t("config.selectPreset")} />
							</SelectTrigger>
							<SelectContent>
								{allPresets.map((preset, i) => (
									<SelectItem key={`${preset.entry.type}-${i}`} value={String(i)}>
										{preset.displayName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				{/* Row 2: Date Range (quick select + picker) */}
				<div className="space-y-s-200">
					<label className="text-small font-medium text-txt-200">{t("config.dateRange")}</label>
					<div className="gap-s-200 flex items-center">
						<Select value={quickRangeKey} onValueChange={handleQuickRange}>
							<SelectTrigger id="backtest-quick-range" className="w-32 shrink-0">
								<SelectValue placeholder={t("builder.quickRange")} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">{t("builder.rangeAll")}</SelectItem>
								<SelectItem value="this_month">{t("builder.rangeThisMonth")}</SelectItem>
								<SelectItem value="this_year">{t("builder.rangeThisYear")}</SelectItem>
								<SelectItem value="3m">{t("builder.range3m")}</SelectItem>
								<SelectItem value="6m">{t("builder.range6m")}</SelectItem>
								<SelectItem value="1y">{t("builder.range1y")}</SelectItem>
								<SelectItem value="custom">{t("builder.rangeCustom")}</SelectItem>
							</SelectContent>
						</Select>
						<DateRangePicker id="backtest-date-range" value={dateRange} onChange={handleDateRangeManual} />
					</div>
				</div>
			</div>

			{/* Config sections — hidden when results are showing */}
			{!result && (
				<>
					{/* Section 2: Entry Rules (dynamic per strategy) */}
					{recipe.entry.type === "orb_breakout" && (
						<OrbEntrySection recipe={recipe} onRecipeChange={setRecipe} />
					)}
					{recipe.entry.type === "macd_wma_alignment" && (
						<DezkEntrySection recipe={recipe} onRecipeChange={setRecipe} />
					)}

					{/* Section 3: Stop & Protection */}
					<StopProtectionSection recipe={recipe} onRecipeChange={setRecipe} />

					{/* Section 4: Sizing & Execution */}
					<SizingExecutionSection recipe={recipe} onRecipeChange={setRecipe} />

					{/* Section 5: Targets & Exit */}
					<TargetsExitSection recipe={recipe} onRecipeChange={setRecipe} />

					{/* Run button */}
					<div className="flex justify-end">
						<Button
							id="backtest-run"
							onClick={handleRun}
							disabled={isPending || !selectedSource || !dateFrom || !dateTo}
							size="lg"
						>
							<Play className="mr-2 h-4 w-4" />
							{t("config.runBacktest")}
						</Button>
					</div>
				</>
			)}

			{/* Results — shown after backtest completes */}
			{result && (
				<div className="space-y-m-500">
					<div className="flex justify-end">
						<Button
							id="backtest-new"
							variant="outline"
							onClick={() => setResult(null)}
							className="gap-s-200"
						>
							<RotateCcw className="h-4 w-4" />
							{t("config.newBacktest")}
						</Button>
					</div>
					<BacktestSummaryCards summary={result.summary} />
					<BacktestEquityChart equityCurve={result.equityCurve} />
					<BacktestTradesTable trades={result.trades} />
				</div>
			)}

			{/* Empty state */}
			{!result && !isPending && (
				<div className="border-bg-300 bg-bg-200 flex flex-col items-center justify-center rounded-lg border p-l-700 text-center">
					<p className="text-heading-3 font-medium text-txt-200">{t("empty.title")}</p>
					<p className="text-body text-txt-300 mt-s-200">{t("empty.description")}</p>
				</div>
			)}
		</div>
	)
}

export { BacktestContent }
