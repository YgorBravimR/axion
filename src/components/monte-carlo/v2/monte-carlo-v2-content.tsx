"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import { Dices, X } from "lucide-react"
import { LoadingSpinner } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputModeSelector } from "../input-mode-selector"
import { DataSourceSelector } from "../data-source-selector"
import { StatsPreview } from "../stats-preview"
import { RiskProfileSelector } from "./risk-profile-selector"
import { V2ResultsSummary } from "./v2-results-summary"
import { V2MetricsCards } from "./v2-metrics-cards"
import { DailyPnlChart } from "./daily-pnl-chart"
import { ModeDistributionChart } from "./mode-distribution-chart"
import { V2DistributionHistogram } from "./v2-distribution-histogram"
import { getSimulationStats, runSimulationV2 } from "@/app/actions/monte-carlo"
import { buildProfileForSim } from "@/lib/risk-profile"
import { useMCCalibration } from "@/components/providers/mc-calibration-provider"
import { buildCalibrationSnapshotV2 } from "@/lib/mc-calibration"
import { toCents } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { RiskManagementProfile } from "@/types/risk-profile"
import type {
	DataSource,
	DataSourceOption,
	MonteCarloResultV2,
	RiskManagementProfileForSim,
	SourceStats,
} from "@/types/monte-carlo"

interface MonteCarloV2ContentProps {
	profiles: RiskManagementProfile[]
	dataSourceOptions: DataSourceOption[]
	budgetCap: number
}

interface FormState {
	winRate: string
	profitFactor: string
	rewardRiskRatio: string
	breakevenRate: string
	simulationCount: string
	initialBalance: string
	monthsToTrade: string
	tradingDaysPerMonth: string
	tradingDaysPerWeek: string
	commissionPerTrade: string
}

const MonteCarloV2Content = ({
	profiles,
	dataSourceOptions,
	budgetCap,
}: MonteCarloV2ContentProps) => {
	const t = useTranslations("monteCarlo.v2")
	const tMC = useTranslations("monteCarlo")
	const tOverlay = useTranslations("overlay")
	const tCommon = useTranslations("common")
	const { showLoading, hideLoading } = useLoadingOverlay()
	const { setSnapshot } = useMCCalibration()

	// Profile selection state
	const [selectedProfileId, setSelectedProfileId] = useState("")
	const [ruinThreshold, setRuinThreshold] = useState("50")

	// Form state — consolidated from 10 individual useState calls
	const [form, setForm] = useState<FormState>({
		winRate: "40.7",
		profitFactor: "",
		rewardRiskRatio: "1.38",
		breakevenRate: "0",
		simulationCount: "5000",
		initialBalance: "50000",
		monthsToTrade: "1",
		tradingDaysPerMonth: "22",
		tradingDaysPerWeek: "5",
		commissionPerTrade: "0",
	})

	const updateField = useCallback(<K extends keyof FormState>(field: K, value: string) => {
		setForm((prev) => ({ ...prev, [field]: value }))
	}, [])

	// Data source state (auto-populate from strategy)
	const [inputMode, setInputMode] = useState<"auto" | "manual">("auto")
	const [selectedSource, setSelectedSource] = useState<DataSource | null>(null)
	const [sourceStats, setSourceStats] = useState<SourceStats | null>(null)
	const [isLoadingStats, setIsLoadingStats] = useState(false)

	// Load stats when source changes
	const loadSourceStats = useCallback(async (source: DataSource) => {
		setIsLoadingStats(true)
		try {
			const response = await getSimulationStats(source)
			setSourceStats(
				response.status === "success" && response.data ? response.data : null
			)
		} catch (error) {
			console.error("Failed to load source stats:", error)
			setSourceStats(null)
		} finally {
			setIsLoadingStats(false)
		}
	}, [])

	useEffect(() => {
		if (selectedSource && inputMode === "auto") {
			loadSourceStats(selectedSource)
		}
	}, [selectedSource, inputMode, loadSourceStats])

	const handleUseStats = useCallback(() => {
		if (!sourceStats) return

		setForm((prev) => ({
			...prev,
			winRate: sourceStats.winRate.toFixed(1),
			profitFactor: sourceStats.profitFactor === Infinity
				? ""
				: sourceStats.profitFactor.toFixed(2),
			commissionPerTrade: sourceStats.avgCommissionPerTradeCents?.toString() ?? "0",
			breakevenRate: sourceStats.breakevenRate?.toFixed(1) ?? "0",
		}))
	}, [sourceStats])

	const handleCustomize = useCallback(() => {
		setInputMode("manual")
	}, [])

	// When Profit Factor is set, auto-derive R:R = PF × (1 - WR) / WR
	const derivedRR = useMemo(() => {
		const pf = parseFloat(form.profitFactor)
		const wr = parseFloat(form.winRate) / 100
		if (isNaN(pf) || pf <= 0 || isNaN(wr) || wr <= 0 || wr >= 1) return null
		return (pf * (1 - wr)) / wr
	}, [form.profitFactor, form.winRate])

	// The effective R:R: derived from PF when set, otherwise manual input
	const effectiveRR = derivedRR ?? parseFloat(form.rewardRiskRatio)

	// Implied PF from current WR + effective R:R (for display)
	const impliedPF = useMemo(() => {
		const wr = parseFloat(form.winRate) / 100
		if (
			isNaN(wr) ||
			wr <= 0 ||
			wr >= 1 ||
			isNaN(effectiveRR) ||
			effectiveRR <= 0
		)
			return null
		return (wr * effectiveRR) / (1 - wr)
	}, [form.winRate, effectiveRR])

	// Budget cap computation
	const budgetInfo = useMemo(() => {
		const maxTradesPerDay = 50
		const days = parseInt(form.tradingDaysPerMonth, 10) || 22
		const months = parseInt(form.monthsToTrade, 10) || 1
		const sims = parseInt(form.simulationCount, 10) || 0
		const totalIterations = maxTradesPerDay * days * months * sims
		const budgetUsage = totalIterations / budgetCap
		const isOverBudget = totalIterations > budgetCap
		return { totalIterations, budgetUsage, isOverBudget }
	}, [form.tradingDaysPerMonth, form.monthsToTrade, form.simulationCount, budgetCap])

	// Results state
	const [result, setResult] = useState<MonteCarloResultV2 | null>(null)
	const [isRunning, setIsRunning] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const selectedProfile = useMemo(
		() => profiles.find((p) => p.id === selectedProfileId),
		[profiles, selectedProfileId]
	)

	// Build simulation profile from the selected risk management profile
	const simProfile = useMemo<RiskManagementProfileForSim | null>(() => {
		if (!selectedProfile) return null

		const wr = parseFloat(form.winRate)
		if (isNaN(wr) || wr <= 0 || isNaN(effectiveRR) || effectiveRR <= 0)
			return null

		return buildProfileForSim(selectedProfile, {
			winRate: wr,
			rewardRiskRatio: effectiveRR,
			breakevenRate: parseFloat(form.breakevenRate) || 0,
			commissionPerTradeCents: toCents(form.commissionPerTrade),
			tradingDaysPerMonth: parseInt(form.tradingDaysPerMonth, 10) || 22,
			tradingDaysPerWeek: parseInt(form.tradingDaysPerWeek, 10) || 5,
		})
	}, [form, selectedProfile])

	const handleRunSimulation = useCallback(async () => {
		if (!simProfile) return

		setIsRunning(true)
		setError(null)
		setResult(null)
		showLoading({ message: tOverlay("runningSimulation") })

		try {
			const balance = Math.round(parseFloat(form.initialBalance) * 100) // to cents
			const simCount = parseInt(form.simulationCount, 10) || 5000
			const months = parseInt(form.monthsToTrade, 10) || 1

			const response = await runSimulationV2({
				profile: simProfile,
				simulationCount: simCount,
				initialBalance: balance,
				monthsToTrade: months,
				ruinThresholdPercent: parseInt(ruinThreshold, 10) || 50,
			})

			if (response.status === "success" && response.data) {
				setResult(response.data)
				setSnapshot(buildCalibrationSnapshotV2(response.data, balance))
			} else {
				const errorDetails = response.errors?.map((e) => e.detail).join(", ")
				setError(errorDetails || response.message)
			}
		} catch (error) {
			console.error("V2 simulation error:", error)
			setError(tMC("errors.failedToRunSimulation"))
		} finally {
			hideLoading()
			setIsRunning(false)
		}
	}, [
		simProfile,
		form.initialBalance,
		form.simulationCount,
		form.monthsToTrade,
		ruinThreshold,
		showLoading,
		hideLoading,
		tOverlay,
		tMC,
	])

	const handleRunAgain = useCallback(() => {
		setResult(null)
	}, [])

	const transformedBuckets = useMemo(
		() =>
			result
				? result.distributionBuckets.map((b) => ({
						...b,
						rangeStart: result.params.initialBalance / 100 + b.rangeStart / 100,
						rangeEnd: result.params.initialBalance / 100 + b.rangeEnd / 100,
					}))
				: [],
		[result]
	)

	const isValid =
		!!simProfile &&
		parseFloat(form.initialBalance) > 0 &&
		parseInt(form.simulationCount, 10) > 0 &&
		!budgetInfo.isOverBudget

	return (
		<div className="space-y-m-500">
			{/* Header */}
			<div>
				<h2 className="text-h3 text-txt-100 font-bold">{t("title")}</h2>
				<p className="mt-s-100 text-small text-txt-300">{t("subtitle")}</p>
			</div>

			{/* Info banner explaining Capital Expectancy */}
			<div className="border-acc-100/30 bg-acc-100/5 p-m-400 text-small text-txt-200 rounded-lg border">
				{t("capitalExplanation")}
			</div>

			{/* Input Section */}
			{!result && (
				<div className="space-y-m-400">
					{/* Input Mode + Data Source (auto mode) */}
					<InputModeSelector mode={inputMode} onModeChange={setInputMode} />
					{inputMode === "auto" && (
						<div className="gap-m-400 grid lg:grid-cols-2">
							<DataSourceSelector
								options={dataSourceOptions}
								selectedSource={selectedSource}
								onSourceChange={setSelectedSource}
								isLoading={isLoadingStats}
							/>
							<StatsPreview
								stats={sourceStats}
								isLoading={isLoadingStats}
								onUseStats={handleUseStats}
								onCustomize={handleCustomize}
							/>
						</div>
					)}

					{/* Profile Selector */}
					<RiskProfileSelector
						profiles={profiles}
						selectedProfileId={selectedProfileId}
						onProfileChange={setSelectedProfileId}
						simProfile={simProfile}
					/>

					{/* Parameters — Row 1: Core trade stats */}
					<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("params.winRate")}
							</label>
							<div className="relative">
								<Input
									id="v2-win-rate"
									type="number"
									step="0.1"
									min="0"
									max="100"
									value={form.winRate}
									onChange={(e) => updateField("winRate", e.target.value)}
									placeholder="40.7"
									className="pr-8"
									aria-label={t("params.winRate")}
								/>
								<span className="text-tiny text-txt-300 absolute top-1/2 right-3 -translate-y-1/2">
									%
								</span>
							</div>
						</div>

						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("params.profitFactor")}
							</label>
							<Input
								id="v2-profit-factor"
								type="number"
								step="0.01"
								min="0"
								value={form.profitFactor}
								onChange={(e) => updateField("profitFactor", e.target.value)}
								placeholder={t("params.profitFactorPlaceholder")}
								aria-label={t("params.profitFactor")}
							/>
						</div>

						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("params.rewardRiskRatio")}
								{derivedRR !== null && (
									<span className="text-tiny text-acc-100 ml-s-200">
										({t("params.derivedFromPF")})
									</span>
								)}
							</label>
							{derivedRR !== null ? (
								<Input
									id="v2-reward-risk-ratio"
									type="number"
									value={derivedRR.toFixed(2)}
									readOnly
									disabled
									className="opacity-70"
									aria-label={t("params.rewardRiskRatio")}
								/>
							) : (
								<Input
									id="v2-reward-risk-ratio"
									type="number"
									step="0.01"
									min="0"
									value={form.rewardRiskRatio}
									onChange={(e) => updateField("rewardRiskRatio", e.target.value)}
									placeholder="1.38"
									aria-label={t("params.rewardRiskRatio")}
								/>
							)}
							{impliedPF !== null && !derivedRR && (
								<p className="text-tiny text-txt-300 mt-s-100">
									{t("params.impliedPF")}: {impliedPF.toFixed(2)}
								</p>
							)}
						</div>

						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("params.breakevenRate")}
							</label>
							<div className="relative">
								<Input
									id="v2-breakeven-rate"
									type="number"
									step="0.1"
									min="0"
									max="80"
									value={form.breakevenRate}
									onChange={(e) => updateField("breakevenRate", e.target.value)}
									placeholder="0"
									className="pr-8"
									aria-label={t("params.breakevenRate")}
								/>
								<span className="text-tiny text-txt-300 absolute top-1/2 right-3 -translate-y-1/2">
									%
								</span>
							</div>
						</div>
					</div>

					{/* Parameters — Row 2: Simulation config */}
					<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("params.simulationCount")}
							</label>
							<Input
								id="v2-simulation-count"
								type="number"
								step="100"
								min="100"
								max="50000"
								value={form.simulationCount}
								onChange={(e) => updateField("simulationCount", e.target.value)}
								placeholder="5000"
								aria-label={t("params.simulationCount")}
							/>
						</div>

						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("params.initialBalance")}
							</label>
							<div className="relative">
								<span className="text-tiny text-txt-300 absolute top-1/2 left-3 -translate-y-1/2">
									R$
								</span>
								<Input
									id="v2-initial-balance"
									type="number"
									step="100"
									min="0"
									value={form.initialBalance}
									onChange={(e) => updateField("initialBalance", e.target.value)}
									placeholder="50000"
									className="pl-8"
									aria-label={t("params.initialBalance")}
								/>
							</div>
						</div>

						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("params.tradingDaysPerMonth")}
							</label>
							<Input
								id="v2-trading-days-month"
								type="number"
								step="1"
								min="1"
								max="30"
								value={form.tradingDaysPerMonth}
								onChange={(e) => updateField("tradingDaysPerMonth", e.target.value)}
								placeholder="22"
								aria-label={t("params.tradingDaysPerMonth")}
							/>
						</div>

						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("params.tradingDaysPerWeek")}
							</label>
							<Input
								id="v2-trading-days-week"
								type="number"
								step="1"
								min="1"
								max="7"
								value={form.tradingDaysPerWeek}
								onChange={(e) => updateField("tradingDaysPerWeek", e.target.value)}
								placeholder="5"
								aria-label={t("params.tradingDaysPerWeek")}
							/>
						</div>
						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("params.commissionPerTrade")}
							</label>
							<Input
								id="v2-commission"
								type="number"
								step="0.01"
								min="0"
								value={form.commissionPerTrade}
								onChange={(e) => updateField("commissionPerTrade", e.target.value)}
								placeholder="0"
								aria-label={t("params.commissionPerTrade")}
							/>
						</div>
						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("params.monthsToTrade")}
							</label>
							<Input
								id="v2-months-to-trade"
								type="number"
								step="1"
								min="1"
								max="48"
								value={form.monthsToTrade}
								onChange={(e) => updateField("monthsToTrade", e.target.value)}
								placeholder="1"
								aria-label={t("params.monthsToTrade")}
							/>
						</div>
						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("params.ruinThreshold")}
							</label>
							<div className="relative">
								<Input
									id="v2-ruin-threshold"
									type="number"
									step="5"
									min="1"
									max="99"
									value={ruinThreshold}
									onChange={(e) => setRuinThreshold(e.target.value)}
									placeholder="50"
									className="pr-8"
									aria-label={t("params.ruinThreshold")}
								/>
								<span className="text-tiny text-txt-300 absolute top-1/2 right-3 -translate-y-1/2">
									%
								</span>
							</div>
						</div>
					</div>

					{/* Budget Indicator */}
					<div className="mt-m-400 text-small flex items-center justify-between">
						<span className="text-txt-300">
							{t("params.totalIterations")}:{" "}
							{budgetInfo.totalIterations.toLocaleString()} /{" "}
							{budgetCap.toLocaleString()}
						</span>
						<span
							className={cn(
								budgetInfo.isOverBudget
									? "text-fb-error font-semibold"
									: budgetInfo.budgetUsage > 0.8
										? "text-warning"
										: "text-txt-300"
							)}
						>
							{(budgetInfo.budgetUsage * 100).toFixed(0)}%
						</span>
					</div>
					{budgetInfo.isOverBudget && (
						<p className="mt-s-200 text-tiny text-fb-error">
							{t("params.budgetExceeded")}
						</p>
					)}

					{/* Error Message */}
					{error && (
						<div
							role="alert"
							aria-live="assertive"
							className="border-fb-error/30 bg-fb-error/10 p-m-400 text-small text-fb-error rounded-lg border flex items-start justify-between gap-s-300"
						>
							<span>{error}</span>
							<button
								type="button"
								onClick={() => setError(null)}
								aria-label={tCommon("close")}
								className="text-fb-error/70 hover:text-fb-error shrink-0 transition-colors"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
					)}

					{/* Run Button */}
					<div className="flex justify-center">
						<Button
							id="monte-carlo-v2-run-simulation"
							size="lg"
							onClick={handleRunSimulation}
							disabled={isRunning || !isValid}
							className="w-full sm:w-auto sm:min-w-[200px]"
						>
							{isRunning ? (
								<LoadingSpinner size="sm" label={tMC("runningSimulation")} />
							) : (
								<>
									<Dices className="mr-s-200 h-5 w-5" />
									{t("params.calculate")}
								</>
							)}
						</Button>
					</div>
				</div>
			)}

			{/* Results Section */}
			{result && (
				<div className="space-y-m-600">
					{/* Top Summary Banner */}
					<V2ResultsSummary
						params={result.params}
						onRunAgain={handleRunAgain}
					/>

					{/* Charts Row */}
					<div className="gap-m-500 grid lg:grid-cols-2">
						<DailyPnlChart
							days={result.sampleRun.days}
							monthsToTrade={result.params.monthsToTrade}
						/>
						<ModeDistributionChart statistics={result.statistics} />
					</div>

					{/* Distribution - Full width (convert buckets from cents-P&L to currency-finalBalance) */}
					<V2DistributionHistogram
						buckets={transformedBuckets}
						medianBalance={
							result.params.initialBalance / 100 +
							result.statistics.medianMonthlyPnl / 100
						}
						initialBalance={result.params.initialBalance / 100}
					/>

					{/* Metrics Cards */}
					<V2MetricsCards
						statistics={result.statistics}
						initialBalance={result.params.initialBalance}
						monthsToTrade={result.params.monthsToTrade}
					/>
				</div>
			)}
		</div>
	)
}

export { MonteCarloV2Content }
