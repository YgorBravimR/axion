"use client"

import { useTranslations } from "next-intl"
import {
	CheckCircle,
	XCircle,
	Target,
	TrendingUp,
	AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getComplianceTone } from "@/lib/compliance"
import type { ComplianceOverview } from "@/app/actions/strategies.types"

interface ComplianceDashboardProps {
	data: ComplianceOverview | null
}

const ComplianceDashboard = ({ data }: ComplianceDashboardProps) => {
	const t = useTranslations("playbook.compliance")

	if (!data) {
		return (
			<div
				id="playbook-compliance"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<h2 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("overview")}
				</h2>
				<div className="text-txt-300 mt-m-400 flex h-24 items-center justify-center">
					{t("unableToLoad")}
				</div>
			</div>
		)
	}

	const tone = getComplianceTone(data.overallCompliance)
	const followedPct =
		data.totalTrackedTrades > 0
			? (data.followedPlanCount / data.totalTrackedTrades) * 100
			: 0
	const deviatedPct =
		data.totalTrackedTrades > 0
			? (data.notFollowedCount / data.totalTrackedTrades) * 100
			: 0
	const topTone = data.topPerformingStrategy
		? getComplianceTone(data.topPerformingStrategy.compliance)
		: null

	return (
		<div
			id="playbook-compliance"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			<h2 className="text-small sm:text-body text-txt-100 font-semibold">
				{t("overview")}
			</h2>

			{data.totalTrackedTrades === 0 ? (
				<div className="text-txt-300 mt-m-400 flex h-24 items-center justify-center text-center">
					<div>
						<p>{t("noDataYet")}</p>
						<p className="text-tiny mt-s-100">{t("trackAdherence")}</p>
					</div>
				</div>
			) : (
				<div className="mt-m-400">
					{/* Main Compliance Score */}
					<div className="gap-m-400 sm:gap-m-500 flex flex-col items-center sm:flex-row">
						<div className="relative h-24 w-24">
							<svg
								className="h-24 w-24 -rotate-90"
								viewBox="0 0 100 100"
								role="img"
								aria-label={t("compliancePercent", {
									percent: data.overallCompliance.toFixed(0),
								})}
							>
								<circle
									cx="50"
									cy="50"
									r="40"
									fill="none"
									stroke="var(--color-bg-300)"
									strokeWidth="8"
								/>
								<circle
									cx="50"
									cy="50"
									r="40"
									fill="none"
									stroke={tone.stroke}
									strokeWidth="8"
									strokeLinecap="round"
									strokeDasharray={`${(data.overallCompliance / 100) * 251.2} 251.2`}
								/>
							</svg>
							<div className="absolute inset-0 flex items-center justify-center">
								<span className={cn("text-h3 font-bold", tone.text)}>
									{data.overallCompliance.toFixed(0)}%
								</span>
							</div>
						</div>

						<div className="flex-1">
							<p className="text-small text-txt-200">
								{t("followedPlan", {
									followed: data.followedPlanCount,
									total: data.totalTrackedTrades,
								})}
							</p>

							{/* Compliance Bar */}
							<div className="mt-s-300">
								<div
									className="bg-bg-300 flex h-4 w-full overflow-hidden rounded-full"
									role="progressbar"
									aria-valuenow={data.overallCompliance}
									aria-valuemin={0}
									aria-valuemax={100}
									aria-label={t("followedPlan", {
										followed: data.followedPlanCount,
										total: data.totalTrackedTrades,
									})}
								>
									<div
										className="bg-txt-100 flex items-center justify-center transition-[width]"
										style={{ width: `${followedPct}%` }}
									/>
									<div
										className="bg-warning flex items-center justify-center transition-[width]"
										style={{ width: `${deviatedPct}%` }}
									/>
								</div>
								<div className="mt-s-200 text-tiny sm:text-small flex justify-between">
									<span className="text-txt-100 gap-s-100 flex items-center">
										<CheckCircle className="h-3 w-3" aria-hidden="true" />
										{t("followedCount", { count: data.followedPlanCount })}
									</span>
									<span className="text-warning gap-s-100 flex items-center">
										<XCircle className="h-3 w-3" aria-hidden="true" />
										{t("deviatedCount", { count: data.notFollowedCount })}
									</span>
								</div>
							</div>
						</div>
					</div>

					{/* Strategy Highlights */}
					{(data.topPerformingStrategy || data.needsAttentionStrategy) && (
						<div className="mt-m-500 gap-s-300 grid grid-cols-1 sm:grid-cols-2">
							{data.topPerformingStrategy && topTone && (
								<div
									className={cn(
										"gap-s-300 p-s-300 sm:p-m-400 flex items-center rounded-lg border",
										topTone.bg,
										topTone.border
									)}
								>
									<TrendingUp
										className={cn("h-5 w-5 shrink-0", topTone.text)}
										aria-hidden="true"
									/>
									<div>
										<p className="text-tiny text-txt-300">
											{t("bestCompliance")}
										</p>
										<p className="text-small text-txt-100 font-semibold">
											{data.topPerformingStrategy.name}
										</p>
										<p className={cn("text-tiny", topTone.text)}>
											{t("compliancePercent", {
												percent:
													data.topPerformingStrategy.compliance.toFixed(0),
											})}
										</p>
									</div>
								</div>
							)}

							{data.needsAttentionStrategy && (
								<div className="bg-warning/10 border-warning/30 gap-s-300 p-s-300 sm:p-m-400 flex items-center rounded-lg border">
									<AlertTriangle
										className="text-warning h-5 w-5 shrink-0"
										aria-hidden="true"
									/>
									<div>
										<p className="text-tiny text-txt-300">
											{t("needsAttention")}
										</p>
										<p className="text-small text-txt-100 font-semibold">
											{data.needsAttentionStrategy.name}
										</p>
										<p className="text-tiny text-warning">
											{t("compliancePercent", {
												percent:
													data.needsAttentionStrategy.compliance.toFixed(0),
											})}
										</p>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Quick Stats */}
					<div className="border-bg-300 mt-m-400 sm:mt-m-500 gap-m-400 sm:gap-m-500 lg:gap-m-600 pt-s-300 sm:pt-m-400 flex items-center justify-center border-t">
						<div className="gap-s-200 flex items-center">
							<Target className="text-txt-200 h-4 w-4" aria-hidden="true" />
							<span className="text-small text-txt-200">
								{data.strategiesCount === 1
									? t("strategiesCount", { count: data.strategiesCount })
									: t("strategiesCountPlural", { count: data.strategiesCount })}
							</span>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export { ComplianceDashboard }
