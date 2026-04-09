"use client"

import { useTranslations } from "next-intl"
import {
	ArrowUpRight,
	ArrowDownRight,
	CheckCircle,
	XCircle,
	AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fromCents } from "@/lib/money"
import { formatCurrency, formatRMultiple } from "@/lib/calculations"
import { formatDateTime } from "@/lib/dates"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { PnLDisplay } from "@/components/journal/pnl-display"
import type { TradeChartData } from "@/types/candle"

interface TradeInfoPanelProps {
	trade: TradeChartData["trade"]
	executions: TradeChartData["executions"]
	fullTrade: {
		preTradeThoughts?: string | null
		postTradeReflection?: string | null
		lessonLearned?: string | null
		disciplineNotes?: string | null
		strategy?: { name: string } | null
		rating?: string | null
		followedPlan?: boolean | null
		mfe?: string | null
		mae?: string | null
		plannedRMultiple?: string | null
		realizedRMultiple?: string | null
		plannedRiskAmount?: number | null
		executionMode: string
		tradeTags?: Array<{ tag: { id: string; name: string; type: string } }>
		timeframe?: { name: string } | null
	}
	tickSize?: number
	tickValue?: number
}

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
	if (value === null || value === undefined || value === "") return null

	return (
		<div className="flex items-center justify-between py-s-100">
			<span className="text-tiny text-txt-300">{label}</span>
			<span className={cn("text-small font-medium text-txt-100", valueClassName)}>
				{value}
			</span>
		</div>
	)
}

const TradeInfoPanel = ({
	trade,
	executions,
	fullTrade,
}: TradeInfoPanelProps) => {
	const tTrade = useTranslations("trade")

	const isLong = trade.direction === "long"
	const pnl = trade.pnl !== null ? fromCents(trade.pnl) : null
	const realizedR = Number(fullTrade.realizedRMultiple) || 0
	const plannedR = Number(fullTrade.plannedRMultiple) || 0

	const tags = fullTrade.tradeTags?.map((tt) => tt.tag) ?? []
	const setupTags = tags.filter((t) => t.type === "setup")
	const mistakeTags = tags.filter((t) => t.type === "mistake")
	const generalTags = tags.filter((t) => t.type === "general")

	const hasNotes =
		fullTrade.preTradeThoughts ||
		fullTrade.postTradeReflection ||
		fullTrade.lessonLearned ||
		fullTrade.disciplineNotes

	return (
		<div
			id="trade-info-panel"
			className="bg-bg-200 border-bg-300 flex h-full flex-col border-l p-m-400"
		>
			<Tabs defaultValue="stats" className="flex h-full flex-col">
				<TabsList id="trade-info-tabs-list" variant="line" className="w-full shrink-0">
					<TabsTrigger id="trade-info-tab-stats" value="stats">
						Stats
					</TabsTrigger>
					<TabsTrigger id="trade-info-tab-notes" value="notes">
						Notes
					</TabsTrigger>
					<TabsTrigger id="trade-info-tab-executions" value="executions">
						Executions
					</TabsTrigger>
				</TabsList>

				{/* Stats Tab */}
				<TabsContent value="stats" className="flex-1 overflow-y-auto pt-m-400">
					<div className="space-y-s-200">
						{/* Direction + Outcome badges */}
						<div className="gap-s-200 flex flex-wrap">
							<Badge
								id="panel-direction-badge"
								variant="outline"
								className={cn(
									isLong
										? "border-trade-buy/30 text-trade-buy"
										: "border-trade-sell/30 text-trade-sell"
								)}
							>
								{isLong ? (
									<ArrowUpRight className="mr-1 h-3 w-3" />
								) : (
									<ArrowDownRight className="mr-1 h-3 w-3" />
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
									<CheckCircle className="mr-1 h-3 w-3" />
									{tTrade("outcome.winner")}
								</Badge>
							)}
							{trade.outcome === "loss" && (
								<Badge
									id="panel-outcome-badge"
									className="bg-trade-sell/20 text-trade-sell"
								>
									<XCircle className="mr-1 h-3 w-3" />
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
							<div className="flex items-center justify-between py-s-100">
								<span className="text-tiny text-txt-300">P&L</span>
								<PnLDisplay value={pnl} size="sm" />
							</div>
						)}

						{/* R-Multiple */}
						{realizedR !== 0 && (
							<MetricRow
								label="Realized R"
								value={formatRMultiple(realizedR)}
								valueClassName={realizedR > 0 ? "text-trade-buy" : "text-trade-sell"}
							/>
						)}
						{plannedR > 0 && (
							<MetricRow label="Planned R" value={formatRMultiple(plannedR)} />
						)}

						<Separator id="panel-separator-prices" />

						{/* Prices */}
						<MetricRow
							label={tTrade("entryPrice")}
							value={`$${Number(trade.entryPrice).toFixed(2)}`}
						/>
						<MetricRow
							label={tTrade("exitPrice")}
							value={
								trade.exitPrice !== null
									? `$${Number(trade.exitPrice).toFixed(2)}`
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
								label="Stop Loss"
								value={`$${Number(trade.stopLoss).toFixed(2)}`}
								valueClassName="text-trade-sell"
							/>
						)}
						{trade.takeProfit !== null && (
							<MetricRow
								label="Take Profit"
								value={`$${Number(trade.takeProfit).toFixed(2)}`}
								valueClassName="text-trade-buy"
							/>
						)}

						{/* MFE / MAE */}
						{(fullTrade.mfe || fullTrade.mae) && (
							<>
								<Separator id="panel-separator-excursion" />
								{fullTrade.mfe && (
									<MetricRow
										label="MFE"
										value={`$${Number(fullTrade.mfe).toFixed(2)}`}
										valueClassName="text-trade-buy"
									/>
								)}
								{fullTrade.mae && (
									<MetricRow
										label="MAE"
										value={`$${Number(fullTrade.mae).toFixed(2)}`}
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
									<MetricRow label="Timeframe" value={fullTrade.timeframe.name} />
								)}
							</>
						)}

						{/* Rating + Followed Plan */}
						{(fullTrade.rating || fullTrade.followedPlan !== null) && (
							<>
								<Separator id="panel-separator-discipline" />
								{fullTrade.rating && (
									<div className="flex items-center justify-between py-s-100">
										<span className="text-tiny text-txt-300">{tTrade("rating")}</span>
										<Badge
											id="panel-rating-badge"
											className={cn(
												"text-tiny",
												fullTrade.rating === "A" && "bg-trade-buy/20 text-trade-buy",
												fullTrade.rating === "B" && "bg-trade-buy/10 text-trade-buy/70",
												fullTrade.rating === "C" && "bg-warning/20 text-warning",
												fullTrade.rating === "D" && "bg-trade-sell/10 text-trade-sell/70",
												fullTrade.rating === "F" && "bg-trade-sell/20 text-trade-sell"
											)}
										>
											{fullTrade.rating}
										</Badge>
									</div>
								)}
								{fullTrade.followedPlan === true && (
									<div className="flex items-center justify-between py-s-100">
										<span className="text-tiny text-txt-300">{tTrade("followedPlan")}</span>
										<Badge
											id="panel-followed-plan-badge"
											className="bg-trade-buy/20 text-trade-buy text-tiny"
										>
											<CheckCircle className="mr-1 h-3 w-3" />
											Yes
										</Badge>
									</div>
								)}
								{fullTrade.followedPlan === false && (
									<div className="flex items-center justify-between py-s-100">
										<span className="text-tiny text-txt-300">{tTrade("followedPlan")}</span>
										<Badge
											id="panel-discipline-breach-badge"
											className="bg-warning/20 text-warning text-tiny"
										>
											<AlertTriangle className="mr-1 h-3 w-3" />
											No
										</Badge>
									</div>
								)}
							</>
						)}

						{/* Tags */}
						{tags.length > 0 && (
							<>
								<Separator id="panel-separator-tags" />
								<div className="gap-s-200 flex flex-wrap pt-s-100">
									{setupTags.map((tag) => (
										<Badge
											id={`panel-setup-tag-${tag.id}`}
											key={tag.id}
											className="bg-trade-buy/10 text-trade-buy text-tiny"
										>
											{tag.name}
										</Badge>
									))}
									{mistakeTags.map((tag) => (
										<Badge
											id={`panel-mistake-tag-${tag.id}`}
											key={tag.id}
											className="bg-warning/10 text-warning text-tiny"
										>
											{tag.name}
										</Badge>
									))}
									{generalTags.map((tag) => (
										<Badge
											id={`panel-general-tag-${tag.id}`}
											key={tag.id}
											className="bg-acc-100/10 text-acc-100 text-tiny"
										>
											{tag.name}
										</Badge>
									))}
								</div>
							</>
						)}
					</div>
				</TabsContent>

				{/* Notes Tab */}
				<TabsContent value="notes" className="flex-1 overflow-y-auto pt-m-400">
					{hasNotes ? (
						<div className="space-y-m-400">
							{fullTrade.preTradeThoughts && (
								<div>
									<p className="text-tiny text-txt-300 font-medium">
										{tTrade("preTradeThoughts")}
									</p>
									<p className="mt-s-200 text-small text-txt-100">
										{fullTrade.preTradeThoughts}
									</p>
								</div>
							)}

							{fullTrade.postTradeReflection && (
								<>
									{fullTrade.preTradeThoughts && (
										<Separator id="panel-separator-pre-post" />
									)}
									<div>
										<p className="text-tiny text-txt-300 font-medium">
											{tTrade("postTradeReflection")}
										</p>
										<p className="mt-s-200 text-small text-txt-100">
											{fullTrade.postTradeReflection}
										</p>
									</div>
								</>
							)}

							{fullTrade.lessonLearned && (
								<>
									<Separator id="panel-separator-lesson" />
									<div>
										<p className="text-tiny text-txt-300 font-medium">
											{tTrade("lessonLearned")}
										</p>
										<p className="mt-s-200 text-small text-txt-100">
											{fullTrade.lessonLearned}
										</p>
									</div>
								</>
							)}

							{fullTrade.disciplineNotes && (
								<>
									<Separator id="panel-separator-discipline-notes" />
									<div className="bg-warning/10 rounded-lg p-s-300">
										<p className="text-tiny text-warning font-medium">
											{tTrade("detail.disciplineNotes")}
										</p>
										<p className="mt-s-200 text-small text-txt-100">
											{fullTrade.disciplineNotes}
										</p>
									</div>
								</>
							)}
						</div>
					) : (
						<p className="text-small text-txt-300">No notes recorded for this trade.</p>
					)}
				</TabsContent>

				{/* Executions Tab */}
				<TabsContent value="executions" className="flex-1 overflow-y-auto pt-m-400">
					{executions.length > 0 ? (
						<div className="space-y-s-200">
							{/* Header row */}
							<div className="text-tiny text-txt-300 grid grid-cols-4 gap-s-200 font-medium">
								<span>Type</span>
								<span>Price</span>
								<span>Qty</span>
								<span>Time</span>
							</div>
							<Separator id="panel-separator-exec-header" />

							{executions.map((exec, index) => {
								const isBuy = isLong
									? exec.type === "entry"
									: exec.type === "exit"
								const timestamp = new Date(exec.timestamp)
								const brtHours = (timestamp.getUTCHours() - 3 + 24) % 24
								const brtMinutes = timestamp.getUTCMinutes()
								const timeStr = `${brtHours.toString().padStart(2, "0")}:${brtMinutes.toString().padStart(2, "0")}`

								return (
									<div
										key={`exec-${index}`}
										className="text-small grid grid-cols-4 gap-s-200 py-s-100"
									>
										<Badge
											id={`panel-exec-badge-${index}`}
											variant="outline"
											className={cn(
												"w-fit text-tiny",
												isBuy
													? "border-action-buy/30 text-action-buy"
													: "border-action-sell/30 text-action-sell"
											)}
										>
											{exec.type === "entry" ? "Entry" : "Exit"}
										</Badge>
										<span className="text-txt-100 font-medium">
											{exec.price.toFixed(2)}
										</span>
										<span className="text-txt-100">x{exec.quantity}</span>
										<span className="text-txt-300">{timeStr}</span>
									</div>
								)
							})}
						</div>
					) : (
						<div className="space-y-s-200">
							{/* Simple entry/exit for non-scaled trades */}
							<div className="text-tiny text-txt-300 grid grid-cols-3 gap-s-200 font-medium">
								<span>Type</span>
								<span>Price</span>
								<span>Qty</span>
							</div>
							<Separator id="panel-separator-simple-exec-header" />
							<div className="text-small grid grid-cols-3 gap-s-200 py-s-100">
								<Badge
									id="panel-simple-entry-badge"
									variant="outline"
									className="border-action-buy/30 text-action-buy w-fit text-tiny"
								>
									Entry
								</Badge>
								<span className="text-txt-100 font-medium">
									{Number(trade.entryPrice).toFixed(2)}
								</span>
								<span className="text-txt-100">x{trade.positionSize}</span>
							</div>
							{trade.exitPrice !== null && (
								<div className="text-small grid grid-cols-3 gap-s-200 py-s-100">
									<Badge
										id="panel-simple-exit-badge"
										variant="outline"
										className="border-action-sell/30 text-action-sell w-fit text-tiny"
									>
										Exit
									</Badge>
									<span className="text-txt-100 font-medium">
										{Number(trade.exitPrice).toFixed(2)}
									</span>
									<span className="text-txt-100">x{trade.positionSize}</span>
								</div>
							)}
						</div>
					)}
				</TabsContent>
			</Tabs>
		</div>
	)
}

export type { TradeInfoPanelProps }
export { TradeInfoPanel }
