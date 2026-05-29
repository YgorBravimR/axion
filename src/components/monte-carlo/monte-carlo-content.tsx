"use client"

import { memo, useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import { Dices } from "lucide-react"
import { LoadingSpinner } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
	Tabs,
	TabsList,
	TabsTrigger,
	AnimatedTabsContent,
} from "@/components/ui/tabs"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { monteCarloGuide } from "@/components/ui/page-guide/guide-configs/monte-carlo"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { InputModeSelector } from "./input-mode-selector"
import { DataSourceSelector } from "./data-source-selector"
import { StatsPreview } from "./stats-preview"
import { SimulationParamsForm } from "./simulation-params-form"
import { EquityCurveChart } from "./equity-curve-chart"
import { DrawdownChart } from "./drawdown-chart"
import { DistributionHistogram } from "./distribution-histogram"
import { MetricsCards } from "./metrics-cards"
import { KellyCriterionCard } from "./kelly-criterion-card"
import { TradeSequenceList } from "./trade-sequence-list"
import { StrategyAnalysis } from "./strategy-analysis"
import { MonteCarloV2Content } from "./v2/monte-carlo-v2-content"
import { getSimulationStats, runSimulation } from "@/app/actions/monte-carlo"
import { defaultSimulationParams } from "@/lib/validations/monte-carlo"
import { useMCCalibrationDispatch } from "@/components/providers/mc-calibration-provider"
import { buildCalibrationSnapshot } from "@/lib/mc-calibration"
import type {
	DataSource,
	SourceStats,
	SimulationParams,
	MonteCarloResult,
	DataSourceOption,
} from "@/types/monte-carlo"
import type { RiskManagementProfile } from "@/types/risk-profile"

interface MonteCarloContentProps {
	initialOptions: DataSourceOption[]
	riskProfiles?: RiskManagementProfile[]
}

export const MonteCarloContent = ({
	initialOptions,
	riskProfiles = [],
}: MonteCarloContentProps) => {
	const t = useTranslations("monteCarlo")
	const tOverlay = useTranslations("overlay")
	const { showLoading, hideLoading } = useLoadingOverlay()
	const setSnapshot = useMCCalibrationDispatch()

	// Mode state
	const [inputMode, setInputMode] = useState<"auto" | "manual">("auto")
	const [selectedSource, setSelectedSource] = useState<DataSource | null>(null)
	const [sourceStats, setSourceStats] = useState<SourceStats | null>(null)
	const [isLoadingStats, setIsLoadingStats] = useState(false)

	// Parameters state
	const [params, setParams] = useState<SimulationParams>(
		defaultSimulationParams
	)

	// Results state
	const [result, setResult] = useState<MonteCarloResult | null>(null)
	const [isRunning, setIsRunning] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Load stats when source changes
	const loadSourceStats = useCallback(
		async (source: DataSource) => {
			setIsLoadingStats(true)
			setError(null)
			try {
				const response = await getSimulationStats(source)
				if (response.status === "success" && response.data) {
					setSourceStats(response.data)
				} else {
					setError(response.message)
					setSourceStats(null)
				}
			} catch {
				setError(t("errors.failedToLoadStats"))
				setSourceStats(null)
			} finally {
				setIsLoadingStats(false)
			}
		},
		[t]
	)

	// When source changes, load stats
	useEffect(() => {
		if (selectedSource && inputMode === "auto") {
			void loadSourceStats(selectedSource)
		}
	}, [selectedSource, inputMode, loadSourceStats])

	// Handle "Use These Stats" button — populates R-based params
	const handleUseStats = () => {
		if (!sourceStats) {
			return
		}
		setParams((prev) => ({
			...prev,
			winRate: sourceStats.winRate,
			rewardRiskRatio: sourceStats.avgRewardRiskRatio,
			commissionImpactR: sourceStats.commissionImpactR,
		}))
	}

	// Handle "Customize" button
	const handleCustomize = () => {
		setInputMode("manual")
	}

	const handleRunSimulation = async () => {
		setIsRunning(true)
		setError(null)
		setResult(null)
		showLoading({ message: tOverlay("runningSimulation") })

		try {
			const response = await runSimulation(params)
			if (response.status === "success" && response.data) {
				setResult(response.data)
				setSnapshot(buildCalibrationSnapshot(response.data))
			} else {
				const errorDetails = response.errors?.map((e) => e.detail).join(", ")
				setError(errorDetails || response.message)
			}
		} catch {
			setError(t("errors.failedToRunSimulation"))
		} finally {
			hideLoading()
			setIsRunning(false)
		}
	}

	// Reset to run again
	const handleRunAgain = () => {
		setResult(null)
	}

	const tV2 = useTranslations("monteCarlo.v2")

	useRegisterPageGuide(monteCarloGuide)
	const { limits } = useFeatureAccess()

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 space-y-m-400 sm:space-y-m-500 container mx-auto max-w-7xl">
			{/* Header */}
			<div>
				<h1 className="text-h3 text-txt-100 font-bold">{t("title")}</h1>
				<p className="mt-s-100 text-small text-txt-300">{t("subtitle")}</p>
			</div>

			{/* Mode Tabs: Edge Expectancy | Capital Expectancy */}
			<Tabs defaultValue="edgeExpectancy">
				<TabsList
					id="monte-carlo-tabs"
					variant="line"
					className="mb-m-400 sm:mb-m-500 snap-x snap-mandatory overflow-x-auto whitespace-nowrap"
				>
					<TabsTrigger value="edgeExpectancy">
						{tV2("tabEdgeExpectancy")}
					</TabsTrigger>
					<TabsTrigger value="capitalExpectancy">
						{tV2("tabCapitalExpectancy")}
					</TabsTrigger>
				</TabsList>

				<AnimatedTabsContent value="edgeExpectancy">
					<EdgeExpectancyContent
						initialOptions={initialOptions}
						inputMode={inputMode}
						setInputMode={setInputMode}
						selectedSource={selectedSource}
						setSelectedSource={setSelectedSource}
						sourceStats={sourceStats}
						isLoadingStats={isLoadingStats}
						params={params}
						setParams={setParams}
						result={result}
						isRunning={isRunning}
						error={error}
						onUseStats={handleUseStats}
						onCustomize={handleCustomize}
						onRunSimulation={handleRunSimulation}
						onRunAgain={handleRunAgain}
						budgetCap={limits.monteCarloV1BudgetCap}
					/>
				</AnimatedTabsContent>

				<AnimatedTabsContent value="capitalExpectancy">
					<MonteCarloV2Content
						profiles={riskProfiles}
						dataSourceOptions={initialOptions}
						budgetCap={limits.monteCarloV2BudgetCap}
					/>
				</AnimatedTabsContent>
			</Tabs>
		</div>
	)
}

// ==========================================
// EDGE EXPECTANCY CONTENT
// ==========================================

interface EdgeExpectancyContentProps {
	initialOptions: DataSourceOption[]
	inputMode: "auto" | "manual"
	setInputMode: (_mode: "auto" | "manual") => void
	selectedSource: DataSource | null
	setSelectedSource: (_source: DataSource | null) => void
	sourceStats: SourceStats | null
	isLoadingStats: boolean
	params: SimulationParams
	setParams: (
		_params: SimulationParams | ((_prev: SimulationParams) => SimulationParams)
	) => void
	result: MonteCarloResult | null
	isRunning: boolean
	error: string | null
	onUseStats: () => void
	onCustomize: () => void
	onRunSimulation: () => void
	onRunAgain: () => void
	budgetCap: number
}

const EdgeExpectancyContent = memo(
	({
		initialOptions,
		inputMode,
		setInputMode,
		selectedSource,
		setSelectedSource,
		sourceStats,
		isLoadingStats,
		params,
		setParams,
		result,
		isRunning,
		error,
		onUseStats,
		onCustomize,
		onRunSimulation,
		onRunAgain,
		budgetCap,
	}: EdgeExpectancyContentProps) => {
		const t = useTranslations("monteCarlo")

		return (
			<div className="space-y-m-400 sm:space-y-m-500">
				{/* Input Section */}
				{!result && (
					<div className="space-y-m-400">
						{/* Mode Selector */}
						<InputModeSelector mode={inputMode} onModeChange={setInputMode} />

						{/* Data Source (Auto mode only) */}
						{inputMode === "auto" && (
							<div className="gap-m-400 grid md:grid-cols-2 lg:grid-cols-2">
								<DataSourceSelector
									options={initialOptions}
									selectedSource={selectedSource}
									onSourceChange={setSelectedSource}
									isLoading={isLoadingStats}
								/>
								<StatsPreview
									stats={sourceStats}
									isLoading={isLoadingStats}
									onUseStats={onUseStats}
									onCustomize={onCustomize}
								/>
							</div>
						)}

						{/* Parameters Form */}
						<SimulationParamsForm
							params={params}
							onChange={setParams}
							disabled={isRunning}
							budgetCap={budgetCap}
						/>

						{/* Error Message */}
						{error && (
							<div className="border-fb-error/30 bg-fb-error/10 p-m-400 text-small text-fb-error rounded-lg border">
								{error}
							</div>
						)}

						{/* Run Button */}
						<div className="flex justify-center">
							<Button
								id="monte-carlo-run-simulation"
								size="lg"
								onClick={onRunSimulation}
								disabled={isRunning}
								className="w-full sm:w-auto sm:min-w-[200px]"
							>
								{isRunning ? (
									<LoadingSpinner size="sm" label={t("runningSimulation")} />
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
					<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
						{/* Top Summary Banner */}
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 gap-m-400 sm:gap-m-500 grid grid-cols-2 rounded-lg border sm:flex sm:flex-wrap sm:items-center sm:justify-between">
							<div className="gap-m-400 flex items-center">
								<span className="text-txt-300 text-small">
									{t("results.simulations")}:
								</span>
								<span className="text-txt-100 font-medium">
									{params.simulationCount.toLocaleString()}
								</span>
							</div>
							<div className="gap-m-400 flex items-center">
								<span className="text-txt-300 text-small">
									{t("results.tradesLabel")}:
								</span>
								<span className="text-txt-100 font-medium">
									{params.numberOfTrades}
								</span>
							</div>
							<div className="gap-m-400 flex items-center">
								<span className="text-txt-300 text-small">
									{t("results.winRateLabel")}:
								</span>
								<span className="text-txt-100 font-medium">
									{params.winRate}%
								</span>
							</div>
							<div className="gap-m-400 flex items-center">
								<span className="text-txt-300 text-small">
									{t("results.rrLabel")}:
								</span>
								<span className="text-txt-100 font-medium">
									1:{params.rewardRiskRatio}
								</span>
							</div>
							<Button
								id="monte-carlo-run-again"
								variant="outline"
								size="sm"
								onClick={onRunAgain}
							>
								<Dices className="mr-s-100 h-4 w-4" />
								{t("results.runAgain")}
							</Button>
						</div>

						{/* Charts Row */}
						<div className="gap-m-400 sm:gap-m-500 grid md:grid-cols-2 lg:grid-cols-2">
							<EquityCurveChart trades={result.sampleRun.trades} />
							<DrawdownChart trades={result.sampleRun.trades} />
						</div>

						{/* Distribution - Full width */}
						<DistributionHistogram
							buckets={result.distributionBuckets}
							medianFinalR={result.statistics.medianFinalR}
						/>

						{/* Metrics Cards */}
						<MetricsCards statistics={result.statistics} />

						{/* Kelly + Trade Sequence - Side by side on desktop */}
						<div className="gap-m-400 sm:gap-m-500 grid lg:grid-cols-2 xl:grid-cols-2">
							<KellyCriterionCard statistics={result.statistics} />
							<TradeSequenceList trades={result.sampleRun.trades} />
						</div>

						{/* Strategy Analysis - Full width */}
						<StrategyAnalysis result={result} />
					</div>
				)}
			</div>
		)
	}
)
