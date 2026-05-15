import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import {
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
import { cn } from "@/lib/utils"
import { getComplianceTone } from "@/lib/compliance"
import { getStrategy, listStrategyVersions } from "@/app/actions/strategies"
import {
	getStrategyConditions,
	getStrategyConditionsRollup,
} from "@/app/actions/strategy-conditions"
import { ConditionTierDisplay } from "@/components/playbook/condition-tier-display"
import { ConditionsScorecard } from "@/components/playbook/conditions-scorecard"
import { ScenarioSection } from "@/components/playbook/scenario-section"
import { getCurrentUser } from "@/app/actions/auth"
import { hasAccess } from "@/lib/feature-access"
import { StrategyDetailGuide } from "@/components/playbook/strategy-detail-guide"
import { StrategyDetailHeader } from "@/components/playbook/strategy-detail-header"

interface StrategyDetailPageProps {
	params: Promise<{ id: string }>
	searchParams: Promise<{ v?: string }>
}

const formatCurrency = (value: number): string => {
	const absValue = Math.abs(value)
	if (absValue >= 1000) {
		return `${value >= 0 ? "+" : "-"}$${(absValue / 1000).toFixed(1)}K`
	}
	return `${value >= 0 ? "+" : "-"}$${absValue.toFixed(0)}`
}

const formatProfitFactor = (value: number): string => {
	if (!Number.isFinite(value)) {
		return "∞"
	}
	if (value === 0) {
		return "0.00"
	}
	return value.toFixed(2)
}

const StrategyDetailPage = async ({
	params,
	searchParams,
}: StrategyDetailPageProps) => {
	const [{ id }, { v: vParam }] = await Promise.all([params, searchParams])
	const [strategyResult, versionsResult, user] = await Promise.all([
		getStrategy(id),
		listStrategyVersions(id),
		getCurrentUser(),
	])

	if (strategyResult.status !== "success" || !strategyResult.data) {
		notFound()
	}
	const isPremium = hasAccess(user?.role ?? "viewer", "premium")
	const strategy = strategyResult.data
	const versions =
		versionsResult.status === "success" ? (versionsResult.data ?? []) : []
	const liveVersionRow = versions.find(
		(vv) => vv.version === strategy.currentVersion
	)
	const liveTradeCount = liveVersionRow?.tradeCount ?? 0

	// Parse the version query param. We trust it cautiously: any value that
	// can't be matched against an existing version row silently falls back
	// to currentVersion (no notFound — a stale link should still land
	// somewhere useful).
	const parsedVersion = (() => {
		if (vParam === undefined) {
			return strategy.currentVersion
		}
		const n = Number.parseInt(vParam, 10)
		if (Number.isNaN(n)) {
			return strategy.currentVersion
		}
		return versions.some((vv) => vv.version === n) ? n : strategy.currentVersion
	})()
	const selectedVersionRow = versions.find((vv) => vv.version === parsedVersion)
	const selectedVersionId = selectedVersionRow?.id

	const [conditionsResult, rollupResult] = await Promise.all([
		getStrategyConditions(id),
		getStrategyConditionsRollup(id, selectedVersionId),
	])

	const t = await getTranslations("playbook")

	const strategyConditions =
		conditionsResult.status === "success" ? (conditionsResult.data ?? []) : []
	const rollup = rollupResult.status === "success" ? rollupResult.data : null
	const isHawksStrategy = rollup?.isHawksStrategy ?? false
	const isHistorical = parsedVersion !== strategy.currentVersion
	const hasMultipleVersions = versions.length > 1

	const complianceTone = getComplianceTone(strategy.compliance)

	const pnlColor = strategy.totalPnl >= 0 ? "text-trade-buy" : "text-trade-sell"

	return (
		<div className="flex h-full flex-col">
			<StrategyDetailGuide />
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-y-auto">
				<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 mx-auto max-w-4xl">
					<StrategyDetailHeader
						strategyId={strategy.id}
						strategyName={strategy.name}
						currentVersion={strategy.currentVersion}
						selectedVersion={parsedVersion}
						nextVersion={strategy.nextVersionNumber}
						liveTradeCount={liveTradeCount}
						versions={versions}
						forkSource={{
							name: strategy.name,
							description: strategy.description ?? undefined,
							entryCriteria: strategy.entryCriteria ?? undefined,
							exitCriteria: strategy.exitCriteria ?? undefined,
							riskRules: strategy.riskRules ?? undefined,
							finalR:
								strategy.finalR !== null && strategy.finalR !== undefined
									? Number(strategy.finalR)
									: undefined,
							maxRiskPercent:
								strategy.maxRiskPercent !== null &&
								strategy.maxRiskPercent !== undefined
									? Number(strategy.maxRiskPercent)
									: undefined,
							screenshotUrl: strategy.screenshotUrl ?? undefined,
							screenshotS3Key: strategy.screenshotS3Key ?? undefined,
							notes: strategy.notes ?? undefined,
						}}
						forkConditions={strategyConditions.map((sc) => ({
							conditionId: sc.conditionId,
							tier: sc.tier,
							sortOrder: sc.sortOrder,
						}))}
					/>

					{/* Performance Stats */}
					<div
						id="strategy-detail-performance"
						className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
					>
						<div className="gap-s-200 flex items-center">
							<BarChart3 className="text-acc-100 h-5 w-5" aria-hidden="true" />
							<h2 className="text-small sm:text-body text-txt-100 font-semibold">
								{t("strategy.performance")}
							</h2>
						</div>

						<div className="mt-s-300 sm:mt-m-400 gap-s-200 sm:gap-s-300 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">{t("strategy.trades")}</p>
								<p className="text-body text-txt-100 mt-s-100 font-bold">
									{strategy.tradeCount}
								</p>
							</div>
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">{t("strategy.pnl")}</p>
								<p className={cn("text-body mt-s-100 font-bold", pnlColor)}>
									{formatCurrency(strategy.totalPnl)}
								</p>
							</div>
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">
									{t("strategy.winRate")}
								</p>
								<p className="text-body text-txt-100 mt-s-100 font-bold">
									{strategy.winRate.toFixed(1)}%
								</p>
							</div>
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">
									{t("strategy.profitFactor")}
								</p>
								<p className="text-body text-txt-100 mt-s-100 font-bold">
									{formatProfitFactor(strategy.profitFactor)}
								</p>
							</div>
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">{t("strategy.avgR")}</p>
								<p
									className={cn(
										"text-body mt-s-100 font-bold",
										strategy.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"
									)}
								>
									{strategy.avgR >= 0 ? "+" : ""}
									{strategy.avgR.toFixed(2)}R
								</p>
							</div>
							<div className="bg-bg-100 p-s-300 rounded-lg text-center">
								<p className="text-tiny text-txt-300">
									{t("strategy.compliance")}
								</p>
								<p
									className={cn(
										"text-body mt-s-100 font-bold",
										complianceTone.text
									)}
								>
									{strategy.compliance.toFixed(0)}%
								</p>
							</div>
						</div>

						{/* Win/Loss breakdown */}
						<div className="mt-s-300 sm:mt-m-400 gap-m-400 sm:gap-m-500 lg:gap-m-600 flex items-center justify-center">
							<div className="gap-s-200 flex items-center">
								<CheckCircle
									className="text-trade-buy h-4 w-4"
									aria-hidden="true"
								/>
								<span className="text-small text-txt-200">
									{t("strategy.wins", { count: strategy.winCount })}
								</span>
							</div>
							<div className="gap-s-200 flex items-center">
								<XCircle
									className="text-trade-sell h-4 w-4"
									aria-hidden="true"
								/>
								<span className="text-small text-txt-200">
									{t("strategy.losses", { count: strategy.lossCount })}
								</span>
							</div>
						</div>
					</div>

					{/* Risk Settings */}
					{(strategy.finalR !== null || strategy.maxRiskPercent !== null) && (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<div className="gap-s-200 flex items-center">
								<Target className="text-txt-200 h-5 w-5" aria-hidden="true" />
								<h2 className="text-small sm:text-body text-txt-100 font-semibold">
									{t("strategy.riskSettings")}
								</h2>
							</div>

							<div className="mt-s-300 sm:mt-m-400 gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2">
								{strategy.finalR !== null && (
									<div className="bg-bg-100 gap-s-300 p-m-400 flex items-center rounded-lg">
										<TrendingUp
											className="text-txt-300 h-6 w-6"
											aria-hidden="true"
										/>
										<div>
											<p className="text-tiny text-txt-300">
												{t("strategy.finalR")}
											</p>
											<p className="text-body text-txt-100 font-bold">
												{Number(strategy.finalR).toFixed(1)}R
											</p>
										</div>
									</div>
								)}
								{strategy.maxRiskPercent !== null && (
									<div className="bg-bg-100 gap-s-300 p-m-400 flex items-center rounded-lg">
										<TrendingDown
											className="text-txt-300 h-6 w-6"
											aria-hidden="true"
										/>
										<div>
											<p className="text-tiny text-txt-300">
												{t("strategy.maxRiskPerTrade")}
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
								<FileText className="text-txt-200 h-5 w-5" aria-hidden="true" />
								<h2 className="text-small sm:text-body text-txt-100 font-semibold">
									{t("strategy.rulesCriteria")}
								</h2>
							</div>

							<div className="mt-m-400 space-y-m-400">
								{strategy.entryCriteria && (
									<div>
										<h3 className="text-small text-txt-100 font-semibold">
											{t("strategy.entryCriteria")}
										</h3>
										<p className="text-small text-txt-200 mt-s-200 whitespace-pre-wrap">
											{strategy.entryCriteria}
										</p>
									</div>
								)}

								{strategy.exitCriteria && (
									<div>
										<h3 className="text-small text-txt-100 font-semibold">
											{t("strategy.exitCriteria")}
										</h3>
										<p className="text-small text-txt-200 mt-s-200 whitespace-pre-wrap">
											{strategy.exitCriteria}
										</p>
									</div>
								)}

								{strategy.riskRules && (
									<div>
										<h3 className="text-small text-txt-100 font-semibold">
											{t("strategy.riskManagement")}
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
					{isPremium && strategyConditions.length > 0 && (
						<div
							id="strategy-detail-conditions"
							className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
						>
							<div className="gap-s-200 flex items-center justify-between">
								<div className="gap-s-200 flex items-center">
									<Filter className="text-txt-200 h-5 w-5" aria-hidden="true" />
									<h2 className="text-small sm:text-body text-txt-100 font-semibold">
										{t("conditions.title")}
									</h2>
								</div>
								{isHawksStrategy && (
									<span className="text-tiny text-acc-100 border-acc-100/40 bg-acc-100/10 px-s-200 py-s-100 rounded-full border">
										{t("scorecard.hawksBadge")}
									</span>
								)}
							</div>
							<div className="mt-m-400">
								<ConditionTierDisplay conditions={strategyConditions} />
							</div>
							{rollup && (
								<div className="mt-m-400 pt-m-400 border-bg-300 border-t">
									<h3 className="text-small text-txt-100 font-semibold">
										{t("scorecard.title")}
									</h3>
									<p className="text-tiny text-txt-300 mt-s-100">
										{t("scorecard.subtitle")}
									</p>
									<div className="mt-m-400">
										<ConditionsScorecard
											rollup={rollup}
											versionLabel={
												hasMultipleVersions
													? {
															version: parsedVersion,
															isHistorical,
														}
													: undefined
											}
										/>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Scenarios */}
					{strategy.scenarioCount > 0 && (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<div className="gap-s-200 flex items-center">
								<ImageIcon
									className="text-txt-200 h-5 w-5"
									aria-hidden="true"
								/>
								<h2 className="text-small sm:text-body text-txt-100 font-semibold">
									{t("scenarios.title")}
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
								{t("strategy.notes")}
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
								{t("strategy.referenceChart")}
							</h2>
							<div className="mt-m-400">
								{/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded screenshot URL, dimensions unknown at render time */}
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

export { StrategyDetailPage as default }
