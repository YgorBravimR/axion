"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import {
	ArrowUpRight,
	ArrowDownRight,
	CheckCircle,
	XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fromCents } from "@/lib/money"
import { formatCurrency, formatRMultiple } from "@/lib/calculations"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { PnLDisplay } from "@/components/journal/pnl-display"
import {
	RatingBadge,
	FollowedPlanBadge,
	TradeTag,
	type RatingGrade,
} from "@/components/journal/trade-badges"
import type { TradeChartData } from "@/types/candle"
import type { TradeInfoPanelProps } from "./trade-info-panel"

/** Compact metric row: label left, value right */
const MetricRow = ({
	label,
	value,
	valueClassName,
}: {
	label: string
	value: string | number | null | undefined
	valueClassName?: string
}) => {
	if (value === null || value === undefined || value === "") {
		return null
	}

	return (
		<div className="py-s-100 flex items-center justify-between">
			<span className="text-tiny text-txt-300">{label}</span>
			<span
				className={cn("text-small text-txt-100 font-medium", valueClassName)}
			>
				{value}
			</span>
		</div>
	)
}

interface TradeInfoStatsTabProps {
	trade: TradeChartData["trade"]
	fullTrade: TradeInfoPanelProps["fullTrade"]
}

const TradeInfoStatsTab = ({ trade, fullTrade }: TradeInfoStatsTabProps) => {
	const tTrade = useTranslations("trade")

	const isLong = trade.direction === "long"
	const pnl = trade.pnl !== null ? fromCents(trade.pnl) : null
	const realizedR = Number(fullTrade.realizedRMultiple) || 0
	const plannedR = Number(fullTrade.plannedRMultiple) || 0

	// L3: Single-pass categorization instead of 3 separate filter() calls
	const { tags, setupTags, mistakeTags, generalTags } = useMemo(() => {
		const allTags = fullTrade.tradeTags?.map((tt) => tt.tag) ?? []
		const setup: typeof allTags = []
		const mistake: typeof allTags = []
		const general: typeof allTags = []

		for (const tag of allTags) {
			if (tag.type === "setup") {
				setup.push(tag)
			} else if (tag.type === "mistake") {
				mistake.push(tag)
			} else {
				general.push(tag)
			}
		}

		return {
			tags: allTags,
			setupTags: setup,
			mistakeTags: mistake,
			generalTags: general,
		}
	}, [fullTrade.tradeTags])

	return (
		<div className="space-y-s-200">
			{/* Direction + Outcome badges */}
			<div className="gap-s-200 flex flex-wrap">
				<Badge
					id="panel-direction-badge"
					variant="outline"
					className={cn(
						isLong
							? "border-action-buy/30 text-action-buy"
							: "border-action-sell/30 text-action-sell"
					)}
				>
					{isLong ? (
						<ArrowUpRight className="mr-s-100 h-3 w-3" aria-hidden="true" />
					) : (
						<ArrowDownRight className="mr-s-100 h-3 w-3" aria-hidden="true" />
					)}
					{isLong
						? tTrade("direction.long").toUpperCase()
						: tTrade("direction.short").toUpperCase()}
				</Badge>

				{trade.outcome === "win" && (
					<Badge
						id="panel-outcome-badge"
						className="bg-trade-buy/20 text-trade-buy"
					>
						<CheckCircle className="mr-s-100 h-3 w-3" aria-hidden="true" />
						{tTrade("outcome.winner")}
					</Badge>
				)}
				{trade.outcome === "loss" && (
					<Badge
						id="panel-outcome-badge"
						className="bg-trade-sell/20 text-trade-sell"
					>
						<XCircle className="mr-s-100 h-3 w-3" aria-hidden="true" />
						{tTrade("outcome.loser")}
					</Badge>
				)}
				{trade.outcome === "breakeven" && (
					<Badge id="panel-outcome-badge" variant="secondary">
						{tTrade("outcome.breakeven")}
					</Badge>
				)}
			</div>

			<Separator id="panel-separator-badges" />

			{/* P&L */}
			{pnl !== null && (
				<div className="py-s-100 flex items-center justify-between">
					<span className="text-tiny text-txt-300">{tTrade("pnl")}</span>
					<PnLDisplay value={pnl} size="sm" />
				</div>
			)}

			{/* R-Multiple */}
			{realizedR !== 0 && (
				<MetricRow
					label={tTrade("realizedR")}
					value={formatRMultiple(realizedR)}
					valueClassName={realizedR > 0 ? "text-trade-buy" : "text-trade-sell"}
				/>
			)}
			{plannedR > 0 && (
				<MetricRow
					label={tTrade("plannedR")}
					value={formatRMultiple(plannedR)}
				/>
			)}

			<Separator id="panel-separator-prices" />

			{/* Prices */}
			<MetricRow
				label={tTrade("entryPrice")}
				value={Number(trade.entryPrice).toFixed(2)}
			/>
			<MetricRow
				label={tTrade("exitPrice")}
				value={
					trade.exitPrice !== null
						? Number(trade.exitPrice).toFixed(2)
						: tTrade("outcome.open")
				}
			/>
			<MetricRow
				label={tTrade("positionSize")}
				value={Number(trade.positionSize).toLocaleString()}
			/>

			{/* Risk */}
			{fullTrade.plannedRiskAmount && (
				<MetricRow
					label={tTrade("riskAmount")}
					value={formatCurrency(fromCents(fullTrade.plannedRiskAmount))}
				/>
			)}

			{/* SL / TP */}
			{trade.stopLoss !== null && (
				<MetricRow
					label={tTrade("stopLoss")}
					value={Number(trade.stopLoss).toFixed(2)}
					valueClassName="text-trade-sell"
				/>
			)}
			{trade.takeProfit !== null && (
				<MetricRow
					label={tTrade("takeProfit")}
					value={Number(trade.takeProfit).toFixed(2)}
					valueClassName="text-trade-buy"
				/>
			)}

			{/* MFE / MAE */}
			{(fullTrade.mfe || fullTrade.mae) && (
				<>
					<Separator id="panel-separator-excursion" />
					{fullTrade.mfe && (
						<MetricRow
							label={tTrade("mfe")}
							value={Number(fullTrade.mfe).toFixed(2)}
							valueClassName="text-trade-buy"
						/>
					)}
					{fullTrade.mae && (
						<MetricRow
							label={tTrade("mae")}
							value={Number(fullTrade.mae).toFixed(2)}
							valueClassName="text-trade-sell"
						/>
					)}
				</>
			)}

			{/* Classification */}
			{(fullTrade.strategy || fullTrade.timeframe || tags.length > 0) && (
				<>
					<Separator id="panel-separator-classification" />
					{fullTrade.strategy && (
						<MetricRow
							label={tTrade("strategy")}
							value={fullTrade.strategy.name}
						/>
					)}
					{fullTrade.timeframe && (
						<MetricRow
							label={tTrade("timeframe")}
							value={fullTrade.timeframe.name}
						/>
					)}
				</>
			)}

			{/* Rating + Followed Plan */}
			{(fullTrade.rating || fullTrade.followedPlan !== null) && (
				<>
					<Separator id="panel-separator-discipline" />
					{fullTrade.rating && (
						<div className="py-s-100 flex items-center justify-between">
							<span className="text-tiny text-txt-300">{tTrade("rating")}</span>
							<RatingBadge
								id="panel-rating-badge"
								grade={fullTrade.rating as RatingGrade}
								className="text-tiny"
							/>
						</div>
					)}
					{fullTrade.followedPlan !== null &&
						fullTrade.followedPlan !== undefined && (
							<div className="py-s-100 flex items-center justify-between">
								<span className="text-tiny text-txt-300">
									{tTrade("followedPlan")}
								</span>
								<FollowedPlanBadge
									id={
										fullTrade.followedPlan
											? "panel-followed-plan-badge"
											: "panel-discipline-breach-badge"
									}
									followed={fullTrade.followedPlan}
									className="text-tiny"
								/>
							</div>
						)}
				</>
			)}

			{/* Tags */}
			{tags.length > 0 && (
				<>
					<Separator id="panel-separator-tags" />
					<div className="gap-s-200 pt-s-100 flex flex-wrap">
						{setupTags.map((tag) => (
							<TradeTag
								id={`panel-setup-tag-${tag.id}`}
								key={tag.id}
								kind="setup"
								name={tag.name}
								className="text-tiny"
							/>
						))}
						{mistakeTags.map((tag) => (
							<TradeTag
								id={`panel-mistake-tag-${tag.id}`}
								key={tag.id}
								kind="mistake"
								name={tag.name}
								className="text-tiny"
							/>
						))}
						{generalTags.map((tag) => (
							<TradeTag
								id={`panel-general-tag-${tag.id}`}
								key={tag.id}
								kind="general"
								name={tag.name}
								className="text-tiny"
							/>
						))}
					</div>
				</>
			)}
		</div>
	)
}

export type { TradeInfoStatsTabProps }
export { TradeInfoStatsTab }
