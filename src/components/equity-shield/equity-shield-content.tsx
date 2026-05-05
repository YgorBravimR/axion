"use client"

import { useState, useCallback, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Shield } from "lucide-react"
import { toCents, fromCents } from "@/lib/money"
import { runEquityShieldFromDb, getEquityShieldPreview } from "@/app/actions/equity-shield"
import { useMCCalibration } from "@/components/providers/mc-calibration-provider"
import { EquityShieldParamsForm } from "./equity-shield-params"
import { EquityShieldStats } from "./equity-shield-stats"
import { EquityShieldChart } from "./equity-shield-chart"
import { MCCalibrationBanner } from "./mc-calibration-banner"
import type { EquityShieldParams, EquityShieldResult } from "@/types/equity-shield"

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

const EquityShieldContent = ({
	tradeYears,
}: EquityShieldContentProps) => {
	const t = useTranslations("equityShield")
	const tOverlay = useTranslations("overlay")
	const { showLoading, hideLoading } = useLoadingOverlay()
	const { snapshot: mcSnapshot, setSnapshot: setMCSnapshot } = useMCCalibration()

	// Phase 4b: legacy monthly plan source-of-balance removed. Phase 5 will rederive from fractal cascade.
	const [params, setParams] = useState<EquityShieldParams>(DEFAULT_PARAMS)

	const [result, setResult] = useState<EquityShieldResult | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(false)

	// Toggle state for live-only mode on each method chart
	const [method1LiveOnly, setMethod1LiveOnly] = useState(false)
	const [method2LiveOnly, setMethod2LiveOnly] = useState(false)

	// Date range — defaults to "All Time"
	const [dateFrom, setDateFrom] = useState<string>(() => {
		if (tradeYears.length > 0) {
			return `${tradeYears[tradeYears.length - 1]}-01-01`
		}
		const d = new Date()
		d.setFullYear(d.getFullYear() - 10)
		return d.toISOString().split("T")[0]
	})
	const [dateTo, setDateTo] = useState<string>(
		() => new Date().toISOString().split("T")[0]
	)
	const [preview, setPreview] = useState<EquityShieldPreview | null>(null)
	const [isLoadingPreview, setIsLoadingPreview] = useState(false)

	const fetchPreview = useCallback(async (from: string, to: string) => {
		if (!from || !to) return

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
	}, [t])

	const handleDateChange = useCallback(async (from: string, to: string) => {
		setDateFrom(from)
		setDateTo(to)
		setResult(null)
		setPreview(null)
		setError(null)

		await fetchPreview(from, to)
	}, [fetchPreview])

	// Fetch initial preview on mount
	useEffect(() => {
		fetchPreview(dateFrom, dateTo)
	// dateFrom/dateTo are stable initial values — this only runs on mount
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const handleRun = useCallback(async () => {
		setIsLoading(true)
		setError(null)
		showLoading({ message: tOverlay("analyzing") })

		try {
			const response = await runEquityShieldFromDb(
				params,
				dateFrom,
				dateTo
			)

			if (response.status === "success" && response.data) {
				setResult(response.data)
				setMethod1LiveOnly(false)
				setMethod2LiveOnly(false)
			} else {
				setError(response.message)
			}
		} catch {
			setError(t("errors.unexpected"))
		} finally {
			setIsLoading(false)
			hideLoading()
		}
	}, [params, dateFrom, dateTo, showLoading, hideLoading, tOverlay, t])

	const initialBalance = fromCents(params.initialBalanceCents)
	const drawdownLimit = fromCents(params.drawdownLimitCents)

	return (
		<div className="space-y-m-400 sm:space-y-m-500">
			{/* Header */}
			<div>
				<div className="flex items-center gap-s-300">
					<Shield className="text-acc-100 h-6 w-6" />
					<h1 className="text-h3 sm:text-h2 text-txt-100 font-semibold">
						{t("title")}
					</h1>
				</div>
				<p className="text-small text-txt-300 mt-s-200">
					{t("subtitle")}
				</p>
			</div>

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
			/>

			{/* Error */}
			{error && (
				<div
					role="alert"
					aria-live="assertive"
					className="border-fb-error/30 bg-fb-error/10 text-fb-error rounded-lg border p-s-300"
				>
					<p className="text-small">{error}</p>
				</div>
			)}

			{/* Results */}
			{result && (
				<div className="border-t border-bg-300 mt-m-400 pt-m-400 space-y-m-400 sm:space-y-m-500">
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
						<div className="flex flex-wrap items-center justify-between gap-s-200">
							<h3 className="text-body text-txt-100 font-semibold">
								{t("charts.method1")}
							</h3>
							<div className="flex items-center gap-s-200">
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
						<div className="flex flex-wrap items-center justify-between gap-s-200">
							<h3 className="text-body text-txt-100 font-semibold">
								{t("charts.method2")}
							</h3>
							<div className="flex items-center gap-s-200">
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
