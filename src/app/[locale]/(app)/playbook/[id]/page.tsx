import { notFound } from "next/navigation"
import Link from "next/link"
import {
	ArrowLeft,
	Target,
	TrendingUp,
	TrendingDown,
	CheckCircle,
	XCircle,
	BarChart3,
	FileText,
	Filter,
	ImageIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { getStrategy } from "@/app/actions/strategies"
import { getStrategyConditions } from "@/app/actions/strategy-conditions"
import { getScenariosByStrategy } from "@/app/actions/scenarios"
import { ConditionTierDisplay } from "@/components/playbook/condition-tier-display"
import { ScenarioSection } from "@/components/playbook/scenario-section"

interface StrategyDetailPageProps {
	params: Promise<{ id: string }>
}

const formatCurrency = (value: number): string => {
	const absValue = Math.abs(value)
	if (absValue >= 1000) {
		return `${value >= 0 ? "+" : "-"}$${(absValue / 1000).toFixed(1)}K`
	}
	return `${value >= 0 ? "+" : "-"}$${absValue.toFixed(0)}`
}

const formatProfitFactor = (value: number): string => {
	if (!Number.isFinite(value)) return "∞"
	if (value === 0) return "0.00"
	return value.toFixed(2)
}

const StrategyDetailPage = async ({ params }: StrategyDetailPageProps) => {
	const { id } = await params
	const [result, conditionsResult] = await Promise.all([
		getStrategy(id),
		getStrategyConditions(id),
	])

	if (result.status !== "success" || !result.data) {
		notFound()
	}

	const strategy = result.data
	const strategyConditions =
		conditionsResult.status === "success" ? (conditionsResult.data ?? []) : []

	const complianceColor =
		strategy.compliance >= 80
			? "text-trade-buy"
			: strategy.compliance >= 50
				? "text-warning"
				: "text-trade-sell"

	const pnlColor = strategy.totalPnl >= 0 ? "text-trade-buy" : "text-trade-sell"

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-y-auto">
				<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 mx-auto max-w-4xl">
					{/* Performance Stats */}
					<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
						<div className="gap-s-200 flex items-center">
							<BarChart3 className="text-acc-100 h-5 w-5" />
							<h2 className="text-small sm:text-body text-txt-100 font-semibold">
								Performance
							</h2>
						</div>

						<div className="mt-s-300 sm:mt-m-400 gap-s-200 sm:gap-s-300 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">Trades</p>
								<p className="text-body text-txt-100 mt-s-100 font-bold">
									{strategy.tradeCount}
								</p>
							</div>
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">P&L</p>
								<p className={`text-body mt-s-100 font-bold ${pnlColor}`}>
									{formatCurrency(strategy.totalPnl)}
								</p>
							</div>
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">Win Rate</p>
								<p className="text-body text-txt-100 mt-s-100 font-bold">
									{strategy.winRate.toFixed(1)}%
								</p>
							</div>
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">Profit Factor</p>
								<p className="text-body text-txt-100 mt-s-100 font-bold">
									{formatProfitFactor(strategy.profitFactor)}
								</p>
							</div>
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">Avg R</p>
								<p
									className={`text-body mt-s-100 font-bold ${
										strategy.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"
									}`}
								>
									{strategy.avgR >= 0 ? "+" : ""}
									{strategy.avgR.toFixed(2)}R
								</p>
							</div>
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">Compliance</p>
								<p
									className={`text-body mt-s-100 font-bold ${complianceColor}`}
								>
									{strategy.compliance.toFixed(0)}%
								</p>
							</div>
						</div>

						{/* Win/Loss breakdown */}
						<div className="mt-s-300 sm:mt-m-400 gap-m-400 sm:gap-m-500 lg:gap-m-600 flex items-center justify-center">
							<div className="gap-s-200 flex items-center">
								<CheckCircle className="text-trade-buy h-4 w-4" />
								<span className="text-small text-txt-200">
									<span className="text-trade-buy font-semibold">
										{strategy.winCount}
									</span>{" "}
									wins
								</span>
							</div>
							<div className="gap-s-200 flex items-center">
								<XCircle className="text-trade-sell h-4 w-4" />
								<span className="text-small text-txt-200">
									<span className="text-trade-sell font-semibold">
										{strategy.lossCount}
									</span>{" "}
									losses
								</span>
							</div>
						</div>
					</div>

					{/* Risk Settings */}
					{(strategy.targetRMultiple || strategy.maxRiskPercent) && (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<div className="gap-s-200 flex items-center">
								<Target className="text-acc-100 h-5 w-5" />
								<h2 className="text-small sm:text-body text-txt-100 font-semibold">
									Risk Settings
								</h2>
							</div>

							<div className="mt-s-300 sm:mt-m-400 gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2">
								{strategy.targetRMultiple && (
									<div className="bg-bg-100 gap-s-300 p-m-400 flex items-center rounded-lg">
										<TrendingUp className="text-trade-buy h-6 w-6" />
										<div>
											<p className="text-tiny text-txt-300">
												Target R-Multiple
											</p>
											<p className="text-body text-txt-100 font-bold">
												{Number(strategy.targetRMultiple).toFixed(1)}R
											</p>
										</div>
									</div>
								)}
								{strategy.maxRiskPercent && (
									<div className="bg-bg-100 gap-s-300 p-m-400 flex items-center rounded-lg">
										<TrendingDown className="text-trade-sell h-6 w-6" />
										<div>
											<p className="text-tiny text-txt-300">
												Max Risk per Trade
											</p>
											<p className="text-body text-txt-100 font-bold">
												{Number(strategy.maxRiskPercent).toFixed(1)}%
											</p>
										</div>
									</div>
								)}
							</div>
						</div>
					)}

					{/* Rules & Criteria */}
					{(strategy.entryCriteria ||
						strategy.exitCriteria ||
						strategy.riskRules) && (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<div className="gap-s-200 flex items-center">
								<FileText className="text-acc-100 h-5 w-5" />
								<h2 className="text-small sm:text-body text-txt-100 font-semibold">
									Rules & Criteria
								</h2>
							</div>

							<div className="mt-m-400 space-y-m-400">
								{strategy.entryCriteria && (
									<div>
										<h3 className="text-small text-txt-100 font-semibold">
											Entry Criteria
										</h3>
										<p className="text-small text-txt-200 mt-s-200 whitespace-pre-wrap">
											{strategy.entryCriteria}
										</p>
									</div>
								)}

								{strategy.exitCriteria && (
									<div>
										<h3 className="text-small text-txt-100 font-semibold">
											Exit Criteria
										</h3>
										<p className="text-small text-txt-200 mt-s-200 whitespace-pre-wrap">
											{strategy.exitCriteria}
										</p>
									</div>
								)}

								{strategy.riskRules && (
									<div>
										<h3 className="text-small text-txt-100 font-semibold">
											Risk Management
										</h3>
										<p className="text-small text-txt-200 mt-s-200 whitespace-pre-wrap">
											{strategy.riskRules}
										</p>
									</div>
								)}
							</div>
						</div>
					)}

					{/* Conditions */}
					{strategyConditions.length > 0 && (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<div className="gap-s-200 flex items-center">
								<Filter className="text-acc-100 h-5 w-5" />
								<h2 className="text-small sm:text-body text-txt-100 font-semibold">
									Trading Conditions
								</h2>
							</div>
							<div className="mt-m-400">
								<ConditionTierDisplay conditions={strategyConditions} />
							</div>
						</div>
					)}

					{/* Scenarios */}
					{strategy.scenarioCount > 0 && (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<div className="gap-s-200 flex items-center">
								<ImageIcon className="text-acc-100 h-5 w-5" />
								<h2 className="text-small sm:text-body text-txt-100 font-semibold">
									Scenarios
								</h2>
							</div>
							<div className="mt-m-400">
								<ScenarioSection strategyId={strategy.id} readOnly />
							</div>
						</div>
					)}

					{/* Notes */}
					{strategy.notes && (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<h2 className="text-small sm:text-body text-txt-100 font-semibold">
								Notes
							</h2>
							<p className="text-small text-txt-200 mt-m-400 whitespace-pre-wrap">
								{strategy.notes}
							</p>
						</div>
					)}

					{/* Screenshot */}
					{strategy.screenshotUrl && (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<h2 className="text-small sm:text-body text-txt-100 font-semibold">
								Reference Chart
							</h2>
							<div className="mt-m-400">
								<img
									src={strategy.screenshotUrl}
									alt={`${strategy.name} reference chart`}
									className="w-full rounded-lg"
								/>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

export default StrategyDetailPage
