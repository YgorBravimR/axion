"use client"

import { useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Shield } from "lucide-react"
import { toCents, fromCents } from "@/lib/money"
import { runEquityShieldFromDb } from "@/app/actions/equity-shield"
import { EquityShieldParamsForm } from "./equity-shield-params"
import { EquityShieldStats } from "./equity-shield-stats"
import { EquityShieldChart } from "./equity-shield-chart"
import type { EquityShieldParams, EquityShieldResult } from "@/types/equity-shield"
import type { MonthlyPlan } from "@/db/schema"

interface EquityShieldContentProps {
	monthlyPlan: MonthlyPlan | null
	initialTradeCount: number
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
	monthlyPlan,
	initialTradeCount,
}: EquityShieldContentProps) => {
	const t = useTranslations("equityShield")
	const tOverlay = useTranslations("overlay")
	const { showLoading, hideLoading } = useLoadingOverlay()

	// Derive initial params from monthly plan if available
	const [params, setParams] = useState<EquityShieldParams>(() => {
		if (monthlyPlan?.accountBalance) {
			const balance =
				typeof monthlyPlan.accountBalance === "string"
					? parseInt(monthlyPlan.accountBalance, 10)
					: monthlyPlan.accountBalance
			return {
				...DEFAULT_PARAMS,
				initialBalanceCents: balance || DEFAULT_PARAMS.initialBalanceCents,
			}
		}
		return DEFAULT_PARAMS
	})

	const [result, setResult] = useState<EquityShieldResult | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(false)

	// Toggle state for live-only mode on each method chart
	const [method1LiveOnly, setMethod1LiveOnly] = useState(false)
	const [method2LiveOnly, setMethod2LiveOnly] = useState(false)

	// Trade range — pre-computation filter (1-based, 0 = all)
	const [tradeFrom, setTradeFrom] = useState(1)
	const [tradeTo, setTradeTo] = useState(0)

	const handleRun = useCallback(async () => {
		setIsLoading(true)
		setError(null)
		showLoading({ message: tOverlay("analyzing") })

		try {
			const response = await runEquityShieldFromDb(
				params,
				tradeFrom,
				tradeTo
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
	}, [params, tradeFrom, tradeTo, showLoading, hideLoading, tOverlay, t])

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

			{/* Parameters */}
			<EquityShieldParamsForm
				params={params}
				onParamsChange={setParams}
				tradeFrom={tradeFrom}
				tradeTo={tradeTo}
				onTradeFromChange={setTradeFrom}
				onTradeToChange={setTradeTo}
				onRun={handleRun}
				isLoading={isLoading}
				tradeCount={initialTradeCount}
			/>

			{/* Error */}
			{error && (
				<div className="border-trade-sell/30 bg-trade-sell/10 text-trade-sell rounded-lg border p-s-300">
					<p className="text-small">{error}</p>
				</div>
			)}

			{/* Results */}
			{result && (
				<>
					{/* Summary Stats */}
					<EquityShieldStats
						stats={result.stats}
						initialBalance={initialBalance}
					/>

					{/* Chart 1: Original Equity Curve */}
					<EquityShieldChart
						data={result.original}
						liveOnlyData={result.original}
						showLiveOnly={false}
						title={t("charts.original")}
						drawdownLimitDollars={drawdownLimit}
						initialBalance={initialBalance}
						variant="original"
					/>

					{/* Chart 2: Method 1 - MDD Exercise */}
					<div className="space-y-s-200">
						<div className="flex items-center justify-between">
							<h3 className="text-body text-txt-100 font-semibold">
								{t("charts.method1")}
							</h3>
							<div className="flex items-center gap-s-200">
								<Switch
									id="m1-live-only"
									checked={method1LiveOnly}
									onCheckedChange={setMethod1LiveOnly}
									aria-label={t("charts.liveOnlyToggle")}
								/>
								<Label
									id="m1-live-only-label"
									htmlFor="m1-live-only"
									className="text-tiny text-txt-300 cursor-pointer"
								>
									{t("charts.liveOnly")}
								</Label>
							</div>
						</div>
						<EquityShieldChart
							data={result.method1}
							liveOnlyData={result.method1LiveOnly}
							showLiveOnly={method1LiveOnly}
							title={t("charts.method1Description")}
							drawdownLimitDollars={drawdownLimit}
							initialBalance={initialBalance}
							variant="method1"
						/>
					</div>

					{/* Chart 3: Method 2 - SMA Crossover */}
					<div className="space-y-s-200">
						<div className="flex items-center justify-between">
							<h3 className="text-body text-txt-100 font-semibold">
								{t("charts.method2")}
							</h3>
							<div className="flex items-center gap-s-200">
								<Switch
									id="m2-live-only"
									checked={method2LiveOnly}
									onCheckedChange={setMethod2LiveOnly}
									aria-label={t("charts.liveOnlyToggle")}
								/>
								<Label
									id="m2-live-only-label"
									htmlFor="m2-live-only"
									className="text-tiny text-txt-300 cursor-pointer"
								>
									{t("charts.liveOnly")}
								</Label>
							</div>
						</div>
						<EquityShieldChart
							data={result.method2}
							liveOnlyData={result.method2LiveOnly}
							showLiveOnly={method2LiveOnly}
							title={t("charts.method2Description")}
							drawdownLimitDollars={drawdownLimit}
							initialBalance={initialBalance}
							variant="method2"
							showSMA
						/>
					</div>
				</>
			)}
		</div>
	)
}

export { EquityShieldContent }
