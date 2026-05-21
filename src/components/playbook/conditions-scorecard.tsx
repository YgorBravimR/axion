"use client"

import { useState, useTransition } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Shield, ShieldCheck, ShieldPlus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { formatDateLocale, formatBrlWithSign } from "@/lib/formatting"
import { getConditionTradeBreakdown } from "@/app/actions/strategy-conditions"
import type {
	ConditionRollup,
	StrategyConditionsRollup,
	TradeBreakdownEntry,
} from "@/app/actions/strategy-conditions.types"
import type { Locale } from "@/i18n/config"

interface ConditionsScorecardProps {
	rollup: StrategyConditionsRollup
	/**
	 * Optional version label rendered above the scorecard so the user knows
	 * which version's trades the rollup was computed from. Omit when there
	 * is only one version (the chip in the page header is sufficient).
	 */
	versionLabel?: {
		version: number
		isHistorical: boolean
	}
	strategyId: string
	versionId?: string
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

interface ScorecardRowProps {
	row: ConditionRollup
	strategyId: string
	versionId?: string
}

const ConditionDrillDownDialog = ({
	onOpenChange,
	strategyId,
	conditionId,
	conditionName,
	versionId,
}: {
	onOpenChange: (_open: boolean) => void
	strategyId: string
	conditionId: string
	conditionName: string
	versionId?: string
}) => {
	const t = useTranslations("playbook.scorecard.drillDown")
	const locale = useLocale() as Locale
	const [breakdown, setBreakdown] = useState<TradeBreakdownEntry[]>([])
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)
	const [hasLoaded, setHasLoaded] = useState(false)

	const handleOpenChange = (newOpen: boolean) => {
		onOpenChange(newOpen)
		if (newOpen && !hasLoaded) {
			setError(null)
			setHasLoaded(true)
			startTransition(async () => {
				const result = await getConditionTradeBreakdown(
					strategyId,
					conditionId,
					versionId
				)
				if (result.status === "success" && result.data) {
					setBreakdown(result.data)
				} else {
					setError(result.message || t("errorState"))
				}
			})
		} else if (!newOpen) {
			setBreakdown([])
			setError(null)
			setHasLoaded(false)
		}
	}

	const metCount = breakdown.filter((t) => t.met).length
	const totalCount = breakdown.length

	return (
		<Dialog onOpenChange={handleOpenChange}>
			<DialogContent id={`drill-down-${conditionId}`}>
				<DialogHeader>
					<DialogTitle>{t("title", { condition: conditionName })}</DialogTitle>
					<DialogDescription>{t("subtitle")}</DialogDescription>
				</DialogHeader>

				{error && (
					<div className="bg-trade-sell/10 text-trade-sell text-small p-s-300 rounded-lg">
						{error}
					</div>
				)}

				{breakdown.length > 0 && (
					<div className="text-small text-txt-300 mb-m-400">
						{t("tradeCountSummary", { met: metCount, total: totalCount })}
					</div>
				)}

				{isPending ? (
					<div className="text-small text-txt-300 py-m-400 text-center">
						{t("loading")}
					</div>
				) : breakdown.length === 0 ? (
					<div className="text-small text-txt-300 py-m-400 text-center">
						{t("emptyState")}
					</div>
				) : (
					<div className="space-y-s-200 max-h-96 overflow-y-auto">
						{breakdown.map((entry) => {
							const isWin = entry.pnl > 0
							return (
								<div
									key={entry.tradeId}
									className="border-bg-300 bg-bg-100 p-s-300 gap-s-300 flex items-center justify-between rounded-sm border"
								>
									<div className="min-w-0 flex-1">
										<div className="gap-s-200 flex items-center justify-between">
											<div className="gap-s-200 flex min-w-0 items-center">
												<span className="text-small text-txt-100 font-medium">
													{entry.ticker}
												</span>
												<span
													className={cn(
														"text-tiny px-s-100 py-s-100 rounded-sm",
														entry.direction === "long"
															? "bg-trade-buy/10 text-trade-buy"
															: "bg-trade-sell/10 text-trade-sell"
													)}
												>
													{entry.direction.toUpperCase()}
												</span>
											</div>
											<span className="text-tiny text-txt-300">
												{formatDateLocale(new Date(entry.tradingDay), locale)}
											</span>
										</div>
										<div className="gap-s-300 mt-s-100 flex items-center">
											<span
												className={cn(
													"text-small font-semibold",
													isWin ? "text-trade-buy" : "text-trade-sell"
												)}
											>
												{formatBrlWithSign(entry.pnl / 100)}
											</span>
											<Badge
												id={`condition-met-badge-${entry.tradeId}`}
												variant={entry.met ? "default" : "secondary"}
												className={cn(
													"text-tiny",
													entry.met
														? "bg-trade-buy/20 text-trade-buy"
														: "bg-trade-sell/20 text-trade-sell"
												)}
											>
												{entry.met ? t("metBadge") : t("notMetBadge")}
											</Badge>
										</div>
									</div>
								</div>
							)
						})}
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

const ScorecardRow = ({ row, strategyId, versionId }: ScorecardRowProps) => {
	const t = useTranslations("playbook.scorecard")
	const meta = tierMeta[row.tier]
	const TierIcon = meta.icon
	const pct = Math.round(row.metRate * 100)
	const noData = row.totalRecorded === 0
	const [isOpen, setIsOpen] = useState(false)

	return (
		<>
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					<button
						id={`scorecard-row-${row.conditionId}`}
						className="border-bg-300 bg-bg-100 hover:bg-bg-200 p-s-300 gap-s-200 flex cursor-pointer flex-col rounded-lg border transition-colors"
						onClick={() => setIsOpen(true)}
						type="button"
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
					</button>
				</DialogTrigger>
				<ConditionDrillDownDialog
					onOpenChange={setIsOpen}
					strategyId={strategyId}
					conditionId={row.conditionId}
					conditionName={row.conditionName}
					versionId={versionId}
				/>
			</Dialog>
		</>
	)
}

export const ConditionsScorecard = ({
	rollup,
	versionLabel,
	strategyId,
	versionId,
}: ConditionsScorecardProps) => {
	const t = useTranslations("playbook.scorecard")

	if (rollup.conditions.length === 0) {
		return null
	}

	const basedOnText =
		versionLabel === undefined
			? t("basedOnTrades", { count: rollup.totalTrades })
			: versionLabel.isHistorical
				? t("basedOnVersionHistorical", {
						version: versionLabel.version,
						count: rollup.totalTrades,
					})
				: t("basedOnVersion", {
						version: versionLabel.version,
						count: rollup.totalTrades,
					})

	if (rollup.totalTrades === 0) {
		return (
			<div className="border-bg-300 bg-bg-100 p-m-400 rounded-lg border text-center">
				<p className="text-small text-txt-200">
					{versionLabel === undefined
						? t("emptyState")
						: t("emptyStateVersion", { version: versionLabel.version })}
				</p>
				<p className="text-tiny text-txt-300 mt-s-100">{t("emptyStateHint")}</p>
			</div>
		)
	}

	return (
		<div className="space-y-m-400">
			<div className="gap-s-200 flex items-baseline justify-between">
				<p className="text-tiny text-txt-300">{basedOnText}</p>
				<p className="text-tiny text-txt-300">{t("metRateHint")}</p>
			</div>
			<div className="gap-s-200 flex flex-col">
				{rollup.conditions.map((row) => (
					<ScorecardRow
						key={row.conditionId}
						row={row}
						strategyId={strategyId}
						versionId={versionId}
					/>
				))}
			</div>
		</div>
	)
}
