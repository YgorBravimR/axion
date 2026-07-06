"use client"

import { useState, useCallback, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Shield } from "lucide-react"
import { toCents, fromCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"
import {
	runEquityShieldFromDb,
	getEquityShieldPreview,
	runGovernorSweepFromDb,
} from "@/app/actions/equity-shield"
import { useMCCalibration } from "@/components/providers/mc-calibration-provider"
import { EquityShieldParamsForm } from "./equity-shield-params"
import { EquityShieldStats } from "./equity-shield-stats"
import { EquityShieldChart } from "./equity-shield-chart"
import { GovernorSweepTable } from "./governor-sweep-table"
import { MCCalibrationBanner } from "./mc-calibration-banner"
import type {
	EquityShieldParams,
	EquityShieldResult,
} from "@/types/equity-shield"
import type { SweepResult } from "@/lib/hawks/governor-sweep"

type ShieldMode = "dd-floor" | "governor"

interface EquityShieldPreview {
	totalTrades: number
	hasEnoughTrades: boolean
}

interface EquityShieldContentProps {
	tradeYears: number[]
}

const DEFAULT_PARAMS: EquityShieldParams = {
	mddMultiplier: 1.3,
	recoveryPercent: 0.3,
	smaPeriod: 10,
	initialBalanceCents: toCents(50000),
	drawdownLimitCents: toCents(2000),
	cutAtDdLimit: false,
}

const EquityShieldContent = ({ tradeYears }: EquityShieldContentProps) => {
	const t = useTranslations("equityShield")
	const tOverlay = useTranslations("overlay")
	const { showLoading, hideLoading } = useLoadingOverlay()
	const { snapshot: mcSnapshot, setSnapshot: setMCSnapshot } =
		useMCCalibration()

	// Phase 4b: legacy monthly plan source-of-balance removed. Phase 5 will rederive from fractal cascade.
	const [params, setParams] = useState<EquityShieldParams>(DEFAULT_PARAMS)

	const [result, setResult] = useState<EquityShieldResult | null>(null)
	const [sweep, setSweep] = useState<SweepResult | null>(null)
	const [mode, setMode] = useState<ShieldMode>("dd-floor")
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(false)

	// Toggle state for live-only mode on each method chart
	const [method1LiveOnly, setMethod1LiveOnly] = useState(false)
	const [method2LiveOnly, setMethod2LiveOnly] = useState(false)

	// Date range — defaults to "All Time"
	const [dateFrom, setDateFrom] = useState<string>(() => {
		const lastYear = tradeYears[tradeYears.length - 1]
		if (lastYear !== undefined) {
			return `${lastYear}-01-01`
		}
		const d = new Date()
		d.setFullYear(d.getFullYear() - 10)
		return formatDateKey(d)
	})
	const [dateTo, setDateTo] = useState<string>(() => formatDateKey(new Date()))
	const [preview, setPreview] = useState<EquityShieldPreview | null>(null)
	const [isLoadingPreview, setIsLoadingPreview] = useState(false)

	const fetchPreview = useCallback(
		async (from: string, to: string) => {
			if (!from || !to) {
				return
			}

			setIsLoadingPreview(true)
			try {
				const response = await getEquityShieldPreview(from, to)
				if (response.status === "success" && response.data) {
					setPreview(response.data)
				} else {
					setError(response.message)
				}
			} catch {
				setError(t("errors.unexpected"))
			} finally {
				setIsLoadingPreview(false)
			}
		},
		[t]
	)

	const handleDateChange = useCallback(
		async (from: string, to: string) => {
			setDateFrom(from)
			setDateTo(to)
			setResult(null)
			setSweep(null)
			setPreview(null)
			setError(null)

			await fetchPreview(from, to)
		},
		[fetchPreview]
	)

	// Fetch initial preview on mount
	useEffect(() => {
		void fetchPreview(dateFrom, dateTo)
	}, [dateFrom, dateTo, fetchPreview])

	const handleRun = useCallback(async () => {
		setIsLoading(true)
		setError(null)
		showLoading({ message: tOverlay("analyzing") })

		try {
			if (mode === "governor") {
				const response = await runGovernorSweepFromDb(dateFrom, dateTo)
				if (response.status === "success" && response.data) {
					setSweep(response.data)
					setResult(null)
				} else {
					setError(response.message)
				}
			} else {
				const response = await runEquityShieldFromDb(params, dateFrom, dateTo)
				if (response.status === "success" && response.data) {
					setResult(response.data)
					setSweep(null)
					setMethod1LiveOnly(false)
					setMethod2LiveOnly(false)
				} else {
					setError(response.message)
				}
			}
		} catch {
			setError(t("errors.unexpected"))
		} finally {
			setIsLoading(false)
			hideLoading()
		}
	}, [mode, params, dateFrom, dateTo, showLoading, hideLoading, tOverlay, t])

	const initialBalance = fromCents(params.initialBalanceCents)
	const drawdownLimit = fromCents(params.drawdownLimitCents)

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 space-y-m-400 sm:space-y-m-500 container mx-auto max-w-7xl">
			{/* Header */}
			<div>
				<div className="gap-s-300 flex items-center">
					<Shield className="text-acc-100 h-6 w-6" aria-hidden="true" />
					<h1 className="text-h3 sm:text-h2 text-txt-100 font-semibold">
						{t("title")}
					</h1>
				</div>
				<p className="text-small text-txt-300 mt-s-200">{t("subtitle")}</p>
			</div>

			{/* Analysis mode toggle: DD-floor shield vs never-red governor */}
			<div
				role="radiogroup"
				aria-label={t("governor.modeToggle")}
				className="gap-s-200 border-bg-300 bg-bg-200 p-s-100 inline-flex rounded-lg border"
			>
				{(["dd-floor", "governor"] as const).map((m) => (
					<button
						key={m}
						type="button"
						role="radio"
						aria-checked={mode === m}
						onClick={() => {
							setMode(m)
							setResult(null)
							setSweep(null)
							setError(null)
						}}
						className={`px-s-300 py-s-100 text-small rounded-md transition-colors ${
							mode === m
								? "bg-acc-100 text-bg-100 font-medium"
								: "text-txt-200 hover:text-txt-100"
						}`}
					>
						{m === "dd-floor"
							? t("governor.modeDdFloor")
							: t("governor.modeGovernor")}
					</button>
				))}
			</div>

			{mode === "governor" && (
				<p className="text-small text-txt-300">{t("governor.description")}</p>
			)}

			{/* Monte Carlo Calibration Banner */}
			{mcSnapshot && (
				<MCCalibrationBanner
					snapshot={mcSnapshot}
					params={params}
					onParamsChange={setParams}
					onDismiss={() => setMCSnapshot(null)}
				/>
			)}

			{/* Parameters */}
			<EquityShieldParamsForm
				params={params}
				onParamsChange={setParams}
				dateFrom={dateFrom}
				dateTo={dateTo}
				onDateChange={handleDateChange}
				tradeYears={tradeYears}
				preview={preview}
				isLoadingPreview={isLoadingPreview}
				onRun={handleRun}
				isLoading={isLoading}
				showComputationParams={mode === "dd-floor"}
			/>

			{/* Error */}
			{error && (
				<div
					role="alert"
					aria-live="assertive"
					className="border-fb-error/30 bg-fb-error/10 text-fb-error p-s-300 rounded-lg border"
				>
					<p className="text-small">{error}</p>
				</div>
			)}

			{/* Governor sweep results */}
			{sweep && (
				<div className="border-bg-300 mt-m-400 pt-m-400 space-y-m-400 border-t">
					<h2 className="text-h3 text-txt-100 font-semibold">
						{t("governor.title")}
					</h2>
					<GovernorSweepTable result={sweep} />
				</div>
			)}

			{/* Results */}
			{result && (
				<div className="border-bg-300 mt-m-400 pt-m-400 space-y-m-400 sm:space-y-m-500 border-t">
					{/* Summary Stats */}
					<EquityShieldStats
						stats={result.stats}
						initialBalance={initialBalance}
						drawdownLimit={drawdownLimit}
					/>

					{/* Chart 1: Original Equity Curve */}
					<EquityShieldChart
						data={result.original}
						showLiveOnly={false}
						title={t("charts.original")}
						drawdownLimitDollars={drawdownLimit}
						initialBalance={initialBalance}
						variant="original"
					/>

					{/* Chart 2: Method 1 - MDD Exercise */}
					<div className="space-y-s-200">
						<div className="gap-s-200 flex flex-wrap items-center justify-between">
							<h3 className="text-body text-txt-100 font-semibold">
								{t("charts.method1")}
							</h3>
							<div className="gap-s-200 flex items-center">
								<Switch
									id="m1-live-only"
									checked={method1LiveOnly}
									onCheckedChange={setMethod1LiveOnly}
									aria-label={`${t("charts.method1")} ${t("charts.liveOnlyToggle")}`}
								/>
								<Label
									id="m1-live-only-label"
									htmlFor="m1-live-only"
									className="text-tiny text-txt-200 cursor-pointer"
								>
									{t("charts.liveOnly")}
								</Label>
							</div>
						</div>
						<EquityShieldChart
							data={result.method1}
							showLiveOnly={method1LiveOnly}
							title={t("charts.method1Description")}
							drawdownLimitDollars={drawdownLimit}
							initialBalance={initialBalance}
							variant="method1"
						/>
					</div>

					{/* Chart 3: Method 2 - SMA Crossover */}
					<div className="space-y-s-200">
						<div className="gap-s-200 flex flex-wrap items-center justify-between">
							<h3 className="text-body text-txt-100 font-semibold">
								{t("charts.method2")}
							</h3>
							<div className="gap-s-200 flex items-center">
								<Switch
									id="m2-live-only"
									checked={method2LiveOnly}
									onCheckedChange={setMethod2LiveOnly}
									aria-label={`${t("charts.method2")} ${t("charts.liveOnlyToggle")}`}
								/>
								<Label
									id="m2-live-only-label"
									htmlFor="m2-live-only"
									className="text-tiny text-txt-200 cursor-pointer"
								>
									{t("charts.liveOnly")}
								</Label>
							</div>
						</div>
						<EquityShieldChart
							data={result.method2}
							showLiveOnly={method2LiveOnly}
							title={t("charts.method2Description")}
							drawdownLimitDollars={drawdownLimit}
							initialBalance={initialBalance}
							variant="method2"
							showSMA
						/>
					</div>
				</div>
			)}
		</div>
	)
}

export { EquityShieldContent }
