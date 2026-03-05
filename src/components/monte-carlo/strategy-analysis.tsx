"use client"

import type { ElementType, ReactNode } from "react"
import { useTranslations } from "next-intl"
import {
	BarChart3,
	TrendingUp,
	AlertTriangle,
	Brain,
	Lightbulb,
	CheckCircle,
	XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatR } from "@/lib/formatting"
import { generateAnalysisInsights } from "@/lib/monte-carlo"
import type { MonteCarloResult } from "@/types/monte-carlo"

interface StrategyAnalysisProps {
	result: MonteCarloResult
}

interface SectionProps {
	icon: ElementType
	title: string
	children: ReactNode
}

const Section = ({ icon: Icon, title, children }: SectionProps) => (
	<div className="border-bg-300 pb-m-400 border-b last:border-0 last:pb-0">
		<div className="mb-s-300 gap-s-200 flex items-center">
			<Icon className="text-accent-primary h-5 w-5" />
			<h4 className="text-small text-txt-100 font-semibold">{title}</h4>
		</div>
		<div className="space-y-s-200 pl-7">{children}</div>
	</div>
)

interface InsightProps {
	type: "positive" | "negative" | "neutral" | "tip"
	children: ReactNode
}

const insightConfig = {
	positive: { Icon: CheckCircle, color: "text-trade-buy" },
	negative: { Icon: XCircle, color: "text-trade-sell" },
	tip: { Icon: Lightbulb, color: "text-fb-warning" },
	neutral: { Icon: Lightbulb, color: "text-txt-200" },
}

const Insight = ({ type, children }: InsightProps) => {
	const { Icon, color } = insightConfig[type]

	return (
		<div className="gap-s-200 flex items-start">
			{type === "tip" ? (
				<span className="text-tiny">bulb</span>
			) : (
				<Icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", color)} />
			)}
			<p className="text-small text-txt-200">{children}</p>
		</div>
	)
}

type ProfitQualityKey = "robust" | "moderate" | "risky"
type CommissionKey = "negligible" | "moderate" | "high"
type RiskKey = "excellent" | "good" | "moderate" | "concerning"

const profitQualityTranslationKeys: Record<ProfitQualityKey, string> = {
	robust: "profitQualityRobust",
	moderate: "profitQualityModerate",
	risky: "profitQualityRisky",
}

const commissionTranslationKeys: Record<CommissionKey, string> = {
	negligible: "commissionCostsNegligible",
	moderate: "commissionCostsModerate",
	high: "commissionCostsHigh",
}

const riskTranslationKeys: Record<RiskKey, string> = {
	excellent: "riskExcellent",
	good: "riskGood",
	moderate: "riskModerate",
	concerning: "riskConcerning",
}

const getDrawdownLabelKey = (ddR: number): string => {
	if (ddR <= 3) return "wellControlled"
	if (ddR <= 5) return "moderate"
	return "highRisk"
}

const getSharpeLabelKey = (ratio: number): string => {
	if (ratio >= 2) return "sharpeExcellent"
	if (ratio >= 1) return "sharpeGood"
	return "sharpeBelowAverage"
}

const getSortinoLabelKey = (ratio: number): string => {
	if (ratio >= 2) return "sortinoStrong"
	return "sortinoModerate"
}

const getWinRateLabelKey = (winRate: number): string => {
	if (winRate >= 50) return "winRateSolid"
	return "winRateRequiresDiscipline"
}

export const StrategyAnalysis = ({ result }: StrategyAnalysisProps) => {
	const t = useTranslations("monteCarlo.analysis")
	const { statistics: stats, params } = result
	const insights = generateAnalysisInsights(result)

	const profitQualityKey =
		profitQualityTranslationKeys[
			insights.profitabilityQuality as ProfitQualityKey
		]
	const commissionKey =
		commissionTranslationKeys[insights.commissionAssessment as CommissionKey]
	const riskKey = riskTranslationKeys[insights.riskAssessment as RiskKey]

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
			<h3 className="mb-m-400 sm:mb-m-500 text-small sm:text-body text-txt-100 font-semibold">
				{t("title")}
			</h3>

			<div className="space-y-m-400">
				{/* Monte Carlo Analysis */}
				<Section icon={BarChart3} title={t("monteCarlo")}>
					<p className="text-small text-txt-300">
						{t("basedOnSimulations", {
							count: params.simulationCount.toLocaleString(),
						})}
					</p>
					<ul className="space-y-s-100 text-small text-txt-200">
						<li>
							• <strong>{t("averageReturn")}:</strong>{" "}
							{formatR(stats.medianFinalR)} ({t("maxDD")}:{" "}
							{formatR(-stats.medianMaxRDrawdown)}) - {t("mostLikelyOutcome")}
						</li>
						<li>
							• <strong>{t("bestCaseLabel")}:</strong>{" "}
							{formatR(stats.bestCaseFinalR)} - {t("top5Percent")}
						</li>
						<li>
							• <strong>{t("worstCaseLabel")}:</strong>{" "}
							{formatR(stats.worstCaseFinalR)} ({t("maxDD")}:{" "}
							{formatR(-stats.worstMaxRDrawdown)}) - {t("maximumDownsideRisk")}
						</li>
					</ul>
					<Insight type={stats.profitablePct >= 70 ? "positive" : "neutral"}>
						{t("simulationsProfitable", {
							percent: stats.profitablePct.toFixed(0),
							quality: t(profitQualityKey),
						})}
					</Insight>
					<Insight type="tip">{t("reliableStrategy")}</Insight>
				</Section>

				{/* Edge Performance */}
				<Section icon={TrendingUp} title={t("edgePerformance")}>
					<p className="text-small text-txt-300">{t("edgeMetrics")}</p>
					<ul className="space-y-s-100 text-small text-txt-200">
						<li>
							• <strong>{t("expectedEdge")}:</strong>{" "}
							{formatR(stats.expectedRPerTrade)} {t("perTrade")}
						</li>
						<li>
							• <strong>{t("commissionImpact")}:</strong>{" "}
							{params.commissionImpactR.toFixed(1)}% {t("ofRisk")}
						</li>
					</ul>
					<Insight
						type={
							insights.commissionAssessment === "negligible"
								? "positive"
								: "neutral"
						}
					>
						{t(commissionKey)}
					</Insight>
				</Section>

				<Section icon={AlertTriangle} title={t("riskAnalysis")}>
					<p className="text-small text-txt-300">{t("riskMetricsIndicate")}</p>
					<ul className="space-y-s-100 text-small text-txt-200">
						<li>
							• <strong>{t("maximumDrawdown")}:</strong>{" "}
							{formatR(-stats.medianMaxRDrawdown)} -{" "}
							{t(getDrawdownLabelKey(stats.medianMaxRDrawdown))}
						</li>
						<li>
							• <strong>{t("sharpeRatio")}:</strong>{" "}
							{stats.sharpeRatio.toFixed(2)} -{" "}
							{t(getSharpeLabelKey(stats.sharpeRatio))}
						</li>
						<li>
							• <strong>{t("sortinoRatio")}:</strong>{" "}
							{stats.sortinoRatio.toFixed(2)} -{" "}
							{t(getSortinoLabelKey(stats.sortinoRatio))}
						</li>
					</ul>
					<Insight
						type={
							insights.riskAssessment === "excellent" ? "positive" : "neutral"
						}
					>
						{t("riskAdjustedPerformance", { quality: t(riskKey) })}
					</Insight>
				</Section>

				{/* Psychology */}
				<Section icon={Brain} title={t("tradingPsychology")}>
					<p className="text-small text-txt-300">{t("psychologicalFactors")}</p>
					<ul className="space-y-s-100 text-small text-txt-200">
						<li>
							• <strong>{t("winRateLabel")}:</strong> {params.winRate}% -{" "}
							{t(getWinRateLabelKey(params.winRate))}
						</li>
						<li>
							• <strong>{t("longestWinStreak")}:</strong>{" "}
							{Math.round(stats.expectedMaxWinStreak)} {t("tradesUnit")}
						</li>
						<li>
							• <strong>{t("longestLossStreak")}:</strong>{" "}
							{Math.round(stats.expectedMaxLossStreak)} {t("tradesUnit")}
						</li>
					</ul>
					{insights.psychologyWarning && (
						<Insight type="tip">{insights.psychologyWarning}</Insight>
					)}
				</Section>

				{/* Improvement Suggestions */}
				{insights.improvementSuggestions.length > 0 && (
					<Section icon={Lightbulb} title={t("strategyImprovements")}>
						<p className="text-small text-txt-300">
							{t("keyAreasOptimization")}
						</p>
						<ul className="space-y-s-100 text-small text-txt-200">
							{insights.improvementSuggestions.map((suggestion, i) => (
								<li key={i}>• {suggestion}</li>
							))}
						</ul>
						<Insight type="tip">{t("bestStrategyTip")}</Insight>
					</Section>
				)}
			</div>
		</div>
	)
}
