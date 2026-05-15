"use client"

import { useTranslations } from "next-intl"
import { Shield, ShieldCheck, ShieldPlus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
	ConditionRollup,
	StrategyConditionsRollup,
} from "@/app/actions/strategy-conditions.types"

interface ConditionsScorecardProps {
	rollup: StrategyConditionsRollup
}

const tierMeta = {
	mandatory: { icon: Shield, rankLabel: "A" },
	tier_2: { icon: ShieldCheck, rankLabel: "AA" },
	tier_3: { icon: ShieldPlus, rankLabel: "AAA" },
} as const

const getMetRateTone = (metRate: number, totalRecorded: number): string => {
	if (totalRecorded === 0) {
		return "text-txt-300"
	}
	if (metRate >= 0.75) {
		return "text-trade-buy"
	}
	if (metRate >= 0.4) {
		return "text-warning"
	}
	return "text-trade-sell"
}

const getBarTone = (metRate: number, totalRecorded: number): string => {
	if (totalRecorded === 0) {
		return "bg-bg-300"
	}
	if (metRate >= 0.75) {
		return "bg-trade-buy"
	}
	if (metRate >= 0.4) {
		return "bg-warning"
	}
	return "bg-trade-sell"
}

const ScorecardRow = ({ row }: { row: ConditionRollup }) => {
	const t = useTranslations("playbook.scorecard")
	const meta = tierMeta[row.tier]
	const TierIcon = meta.icon
	const pct = Math.round(row.metRate * 100)
	const noData = row.totalRecorded === 0

	return (
		<div
			id={`scorecard-row-${row.conditionId}`}
			className="border-bg-300 bg-bg-100 p-s-300 gap-s-200 flex flex-col rounded-lg border"
		>
			<div className="gap-s-200 flex items-center justify-between">
				<div className="gap-s-200 flex min-w-0 items-center">
					<TierIcon
						className="text-txt-200 h-4 w-4 shrink-0"
						aria-hidden="true"
					/>
					<span className="text-small text-txt-100 truncate font-medium">
						{row.conditionName}
					</span>
					<Badge
						id={`scorecard-rank-${row.conditionId}`}
						variant="outline"
						className="text-tiny text-txt-300 border-bg-300 shrink-0"
					>
						{meta.rankLabel}
					</Badge>
				</div>
				<div className="gap-s-200 flex shrink-0 items-center">
					<span className="text-tiny text-txt-300">
						{t("metOverRecorded", {
							met: row.metCount,
							total: row.totalRecorded,
						})}
					</span>
					<span
						className={cn(
							"text-small font-semibold tabular-nums",
							getMetRateTone(row.metRate, row.totalRecorded)
						)}
					>
						{noData ? "—" : `${pct}%`}
					</span>
				</div>
			</div>
			<div
				className="bg-bg-300 h-1 w-full overflow-hidden rounded-full"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={noData ? 0 : pct}
			>
				<div
					className={cn(
						"h-full transition-all",
						getBarTone(row.metRate, row.totalRecorded)
					)}
					style={{ width: noData ? "0%" : `${pct}%` }}
				/>
			</div>
		</div>
	)
}

export const ConditionsScorecard = ({ rollup }: ConditionsScorecardProps) => {
	const t = useTranslations("playbook.scorecard")

	if (rollup.conditions.length === 0) {
		return null
	}

	if (rollup.totalTrades === 0) {
		return (
			<div className="border-bg-300 bg-bg-100 p-m-400 rounded-lg border text-center">
				<p className="text-small text-txt-200">{t("emptyState")}</p>
				<p className="text-tiny text-txt-300 mt-s-100">{t("emptyStateHint")}</p>
			</div>
		)
	}

	return (
		<div className="space-y-m-400">
			<div className="gap-s-200 flex items-baseline justify-between">
				<p className="text-tiny text-txt-300">
					{t("basedOnTrades", { count: rollup.totalTrades })}
				</p>
				<p className="text-tiny text-txt-300">{t("metRateHint")}</p>
			</div>
			<div className="gap-s-200 flex flex-col">
				{rollup.conditions.map((row) => (
					<ScorecardRow key={row.conditionId} row={row} />
				))}
			</div>
		</div>
	)
}
