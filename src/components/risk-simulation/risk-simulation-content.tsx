"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import { FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { riskSimulationGuide } from "@/components/ui/page-guide/guide-configs/risk-simulation"
import { SimulationConfigPanel } from "./simulation-config-panel"
import { SummaryCards } from "./summary-cards"
import { EquityCurveOverlay } from "./equity-curve-overlay"
import { TradeComparisonTable } from "./trade-comparison-table"
import { SkippedTradesWarning } from "./skipped-trades-warning"
import { DecisionTraceModal } from "./decision-trace-modal"
import {
	getSimulationPreview,
	runRiskSimulationFromDb,
} from "@/app/actions/risk-simulation"
import type { MonthlyPlan } from "@/db/schema"
import type { RiskManagementProfile } from "@/types/risk-profile"
import type {
	PrefillSource,
	AdvancedSimulationParams,
	RiskSimulationParams,
	RiskSimulationResult,
	SimulationPreview,
} from "@/types/risk-simulation"

interface RiskSimulationContentProps {
	monthlyPlan: MonthlyPlan | null
	riskProfiles: RiskManagementProfile[]
	tradeYears: number[]
}

const RiskSimulationContent = ({
	monthlyPlan,
	riskProfiles,
	tradeYears,
}: RiskSimulationContentProps) => {
	const t = useTranslations("riskSimulation")
	const tCommon = useTranslations("common")
	const tOverlay = useTranslations("overlay")
	const { showLoading, hideLoading } = useLoadingOverlay()

	// Register page guide so the header trigger appears
	useRegisterPageGuide(riskSimulationGuide)

	// Config state — default to last 30 days
	const [dateFrom, setDateFrom] = useState(() => {
		const d = new Date()
		d.setDate(d.getDate() - 30)
		return d.toISOString().split("T")[0]
	})
	const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0])
	const [params, setParams] = useState<RiskSimulationParams | null>(null)
	const [preview, setPreview] = useState<SimulationPreview | null>(null)
	const [isLoadingPreview, setIsLoadingPreview] = useState(false)

	// Prefill state
	const [prefillSource, setPrefillSource] = useState<PrefillSource | null>(null)
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
	const originalAdvancedParamsRef = useRef<AdvancedSimulationParams | null>(null)

	// Result state
	const [result, setResult] = useState<RiskSimulationResult | null>(null)
	const [traceModalOpen, setTraceModalOpen] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleDateChange = useCallback(
		async (from: string, to: string) => {
			setDateFrom(from)
			setDateTo(to)
			setResult(null)
			setPreview(null)
			setError(null)

			if (!from || !to) return

			setIsLoadingPreview(true)
			const response = await getSimulationPreview(from, to)
			setIsLoadingPreview(false)

			if (response.status === "success" && response.data) {
				setPreview(response.data)
			} else {
				setError(response.message)
			}
		},
		[]
	)

	// Fetch preview for the initial date range on mount
	useEffect(() => {
		handleDateChange(dateFrom, dateTo)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const handlePrefillSelect = useCallback(
		(newParams: RiskSimulationParams, source: PrefillSource, profileId?: string) => {
			setPrefillSource(source)
			setActiveProfileId(profileId ?? null)
			setParams(newParams)
			setResult(null)

			if (newParams.mode === "advanced") {
				originalAdvancedParamsRef.current = { ...newParams }
			} else {
				originalAdvancedParamsRef.current = null
			}
		},
		[]
	)

	const handleRunSimulation = useCallback(async () => {
		if (!dateFrom || !dateTo || !params) return

		setError(null)
		showLoading({ message: tOverlay("runningRiskSimulation") })

		const response = await runRiskSimulationFromDb(dateFrom, dateTo, params)

		hideLoading()

		if (response.status === "success" && response.data) {
			setResult(response.data)
		} else {
			setError(response.errors?.[0]?.detail ?? response.message)
		}
	}, [dateFrom, dateTo, params, showLoading, hideLoading, tOverlay])

	const allTradesLackSl = preview !== null && preview.tradesWithSl === 0 && preview.totalTrades > 0
	const canRun = dateFrom && dateTo && params && preview && !allTradesLackSl
	const isLocked = prefillSource !== null && prefillSource !== "manual"

	return (
		<div className="space-y-m-400 sm:space-y-m-500">
			{/* Header */}
			<div>
				<div className="flex items-center gap-3">
					<FlaskConical className="text-acc-100 h-7 w-7" aria-hidden="true" />
					<h1 className="text-h3 sm:text-h2 text-txt-100 font-semibold">{t("title")}</h1>
				</div>
				<p className="text-small text-txt-300 mt-s-200">{t("subtitle")}</p>
			</div>

			{/* Config Panel */}
			<SimulationConfigPanel
				dateFrom={dateFrom}
				dateTo={dateTo}
				onDateChange={handleDateChange}
				tradeYears={tradeYears}
				params={params}
				onParamsChange={setParams}
				preview={preview}
				isLoadingPreview={isLoadingPreview}
				monthlyPlan={monthlyPlan}
				riskProfiles={riskProfiles}
				allTradesLackSl={allTradesLackSl}
				prefillSource={prefillSource}
				activeProfileId={activeProfileId}
				onPrefillSelect={handlePrefillSelect}
				isLocked={isLocked}
				originalAdvancedParams={originalAdvancedParamsRef.current}
			/>

			{/* Run Button */}
			<div className="flex items-center gap-4">
				<Button
					id="btn-run-simulation"
					onClick={handleRunSimulation}
					disabled={!canRun}
					className="bg-acc-100 hover:bg-acc-100/90 text-white"
					aria-label={t("runSimulation")}
				>
					<FlaskConical className="mr-2 h-4 w-4" />
					{t("runSimulation")}
				</Button>
				{error && (
					<p className="text-small text-fb-error">
						{error === "common.unexpectedError" ? tCommon("unexpectedError") : error}
					</p>
				)}
			</div>

			{/* Results */}
			{result && (
				<div className="space-y-m-400 sm:space-y-m-500">
					<SummaryCards summary={result.summary} />

					<EquityCurveOverlay equityCurve={result.equityCurve} />

					<div className="flex items-center justify-between">
						<h2 className="text-body sm:text-h3 text-txt-100 font-semibold">
							{t("tradeBreakdown")}
						</h2>
						<Button
							id="btn-view-trace"
							variant="outline"
							onClick={() => setTraceModalOpen(true)}
							className="min-h-[44px] min-w-[44px]"
							aria-label={t("viewDecisionTrace")}
						>
							{t("viewDecisionTrace")}
						</Button>
					</div>

					<SkippedTradesWarning summary={result.summary} />

					<TradeComparisonTable trades={result.trades} />

					<DecisionTraceModal
						open={traceModalOpen}
						onOpenChange={setTraceModalOpen}
						weeks={result.weeks}
					/>
				</div>
			)}
		</div>
	)
}

export { RiskSimulationContent }
