import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
	ArrowLeft,
	ArrowUpRight,
	ArrowDownRight,
	Calendar,
	Edit,
	Trash2,
	Target,
	TrendingUp,
	AlertTriangle,
	CheckCircle,
	XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/dates"
import { formatCurrency, formatRMultiple } from "@/lib/calculations"
import { fromCents } from "@/lib/money"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
	PnLDisplay,
	TradeMetric,
	RMultipleBar,
	TradeExecutionsSection,
} from "@/components/journal"
import { getTrade } from "@/app/actions/trades"
import { getAssetBySymbol } from "@/app/actions/assets"
import { DeleteTradeButton } from "./delete-button"
import { TradeDetailGuide } from "@/components/journal/trade-detail-guide"


interface TradeDetailPageProps {
	params: Promise<{ id: string }>
}

const TradeDetailPage = async ({ params }: TradeDetailPageProps) => {
	const { id } = await params
	const tTrade = await getTranslations("trade")
	const result = await getTrade(id)

	if (result.status === "error" || !result.data) {
		notFound()
	}

	const trade = result.data

	// Fetch asset data for tick size/value (for execution calculations)
	const asset = await getAssetBySymbol(trade.asset)
	// pnl is stored in cents, convert to dollars for display
	const pnl = fromCents(trade.pnl)
	const realizedR = Number(trade.realizedRMultiple) || 0
	const plannedR = Number(trade.plannedRMultiple) || 0
	const isLong = trade.direction === "long"
	const isWin = trade.outcome === "win"
	const isLoss = trade.outcome === "loss"

	const tags = trade.tradeTags?.map((tt) => tt.tag) || []
	const setupTags = tags.filter((t) => t.type === "setup")
	const mistakeTags = tags.filter((t) => t.type === "mistake")
	const generalTags = tags.filter((t) => t.type === "general")

	return (
		<div className="flex h-full flex-col">
			<TradeDetailGuide />
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-auto">
				<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 mx-auto max-w-4xl">
					{/* Header Card */}
					<Card
						id="trade-detail-header"
						className="p-m-400 sm:p-m-500 lg:p-m-600"
					>
						<div className="gap-m-400 flex flex-col sm:flex-row sm:items-start sm:justify-between">
							<div className="gap-s-300 sm:gap-m-500 flex items-center">
								<div
									className={cn(
										"flex h-14 w-14 items-center justify-center rounded-xl",
										isLong ? "bg-action-buy-muted" : "bg-action-sell-muted"
									)}
								>
									{isLong ? (
										<ArrowUpRight className="text-action-buy h-7 w-7" />
									) : (
										<ArrowDownRight className="text-action-sell h-7 w-7" />
									)}
								</div>
								<div>
									<div className="gap-s-300 flex items-center">
										<h2 className="text-h2 text-txt-100 font-bold">
											{trade.asset}
										</h2>
										<Badge
											id="trade-detail-direction"
											variant="outline"
											className={cn(
												isLong
													? "border-trade-buy/30 text-trade-buy"
													: "border-trade-sell/30 text-trade-sell"
											)}
										>
											{isLong ? tTrade("direction.long").toUpperCase() : tTrade("direction.short").toUpperCase()}
										</Badge>
										{trade.timeframe && (
											<Badge id="trade-detail-timeframe" variant="secondary">
												{trade.timeframe.name}
											</Badge>
										)}
									</div>
									<div className="mt-s-200 gap-m-400 text-small text-txt-300 flex items-center">
										<div className="gap-s-200 flex items-center">
											<Calendar className="h-4 w-4" />
											<span>{formatDateTime(trade.entryDate)}</span>
										</div>
										{trade.exitDate && (
											<>
												<span>→</span>
												<span>{formatDateTime(trade.exitDate)}</span>
											</>
										)}
									</div>
								</div>
							</div>

							<div className="gap-s-300 flex items-center self-end sm:self-auto">
								<Link href={`/journal/${trade.id}/edit`}>
									<Button
										id="trade-detail-edit"
										variant="ghost"
										size="icon"
										className="h-9 w-9"
										aria-label={tTrade("editTrade")}
									>
										<Edit className="h-4 w-4" />
									</Button>
								</Link>
								<DeleteTradeButton tradeId={trade.id} />
								<div className="text-right">
									<PnLDisplay value={pnl} size="xl" />
									{realizedR !== 0 && (
										<p
											className={cn(
												"mt-s-200 text-body",
												realizedR > 0 ? "text-trade-buy" : "text-trade-sell"
											)}
										>
											{formatRMultiple(realizedR)}
										</p>
									)}
								</div>
							</div>
						</div>

						{/* Outcome Badge */}
						<div className="mt-m-500 gap-s-300 flex items-center">
							{isWin && (
								<Badge
									id="trade-detail-outcome-win"
									className="bg-trade-buy/20 text-trade-buy"
								>
									<CheckCircle className="mr-1 h-3 w-3" />
									{tTrade("outcome.winner")}
								</Badge>
							)}
							{isLoss && (
								<Badge
									id="trade-detail-outcome-loss"
									className="bg-trade-sell/20 text-trade-sell"
								>
									<XCircle className="mr-1 h-3 w-3" />
									{tTrade("outcome.loser")}
								</Badge>
							)}
							{trade.outcome === "breakeven" && (
								<Badge id="trade-detail-outcome-breakeven" variant="secondary">
									{tTrade("outcome.breakeven")}
								</Badge>
							)}
							{trade.followedPlan === true && (
								<Badge
									id="trade-detail-followed-plan"
									className="bg-trade-buy/20 text-trade-buy"
								>
									<CheckCircle className="mr-1 h-3 w-3" />
									{tTrade("followedPlan")}
								</Badge>
							)}
							{trade.followedPlan === false && (
								<Badge
									id="trade-detail-discipline-breach"
									className="bg-warning/20 text-warning"
								>
									<AlertTriangle className="mr-1 h-3 w-3" />
									{tTrade("detail.disciplineBreach")}
								</Badge>
							)}
						</div>
					</Card>

					{/* Metrics Grid */}
					<div id="trade-detail-metrics" className="gap-s-300 sm:gap-m-400 lg:gap-m-500 grid grid-cols-2 md:grid-cols-4">
						<Card
							id="trade-detail-entry-price"
							className="p-s-300 sm:p-m-400 lg:p-m-500 min-w-0"
						>
							<TradeMetric
								label={tTrade("entryPrice")}
								value={`$${Number(trade.entryPrice).toFixed(2)}`}
								size="lg"
							/>
						</Card>
						<Card
							id="trade-detail-exit-price"
							className="p-s-300 sm:p-m-400 lg:p-m-500 min-w-0"
						>
							<TradeMetric
								label={tTrade("exitPrice")}
								value={
									trade.exitPrice
										? `$${Number(trade.exitPrice).toFixed(2)}`
										: tTrade("outcome.open")
								}
								size="lg"
							/>
						</Card>
						<Card
							id="trade-detail-position-size"
							className="p-s-300 sm:p-m-400 lg:p-m-500 min-w-0"
						>
							<TradeMetric
								label={tTrade("positionSize")}
								value={Number(trade.positionSize).toLocaleString()}
								size="lg"
							/>
						</Card>
						<Card
							id="trade-detail-risk-amount"
							className="p-s-300 sm:p-m-400 lg:p-m-500 min-w-0"
						>
							<TradeMetric
								label={tTrade("riskAmount")}
								value={
									trade.plannedRiskAmount
										? formatCurrency(fromCents(trade.plannedRiskAmount))
										: "—"
								}
								size="lg"
							/>
						</Card>
					</div>

					{/* Executions Section (for scaled mode) */}
					<TradeExecutionsSection
						tradeId={trade.id}
						executionMode={trade.executionMode}
						direction={trade.direction}
						executions={trade.executions ?? []}
						tickSize={asset ? Number(asset.tickSize) : undefined}
						tickValue={asset ? Number(asset.tickValue) / 100 : undefined}
					/>

					{/* R-Multiple Visualization */}
					{(plannedR > 0 || realizedR !== 0) && (
						<Card
							id="trade-detail-risk-analysis"
							className="p-m-400 sm:p-m-500 lg:p-m-600"
						>
							<h3 className="mb-s-300 sm:mb-m-500 gap-s-200 text-small sm:text-body text-txt-100 flex items-center font-semibold">
								<Target className="text-acc-100 h-5 w-5" />
								{tTrade("detail.riskRewardAnalysis")}
							</h3>
							<RMultipleBar
								planned={plannedR || undefined}
								actual={realizedR}
							/>
						</Card>
					)}

					{/* MFE/MAE */}
					{(trade.mfe || trade.mae) && (
						<Card
							id="trade-detail-excursion"
							className="p-m-400 sm:p-m-500 lg:p-m-600"
						>
							<h3 className="mb-s-300 sm:mb-m-500 text-small sm:text-body text-txt-100 font-semibold">
								{tTrade("detail.tradeExcursion")}
							</h3>
							<div className="gap-s-300 sm:gap-m-500 grid grid-cols-1 sm:grid-cols-2">
								{trade.mfe && (
									<div className="bg-trade-buy/10 p-s-300 sm:p-m-400 rounded-lg">
										<p className="text-tiny text-txt-300">
											{tTrade("detail.mfe")}
										</p>
										<p className="mt-s-100 text-body text-trade-buy font-semibold">
											${Number(trade.mfe).toFixed(2)}
										</p>
									</div>
								)}
								{trade.mae && (
									<div className="bg-trade-sell/10 p-s-300 sm:p-m-400 rounded-lg">
										<p className="text-tiny text-txt-300">{tTrade("detail.mae")}</p>
										<p className="mt-s-100 text-body text-trade-sell font-semibold">
											${Number(trade.mae).toFixed(2)}
										</p>
									</div>
								)}
							</div>
						</Card>
					)}

					{/* Strategy & Tags */}
					{(trade.strategy || tags.length > 0) && (
						<Card
							id="trade-detail-classification"
							className="p-m-400 sm:p-m-500 lg:p-m-600"
						>
							<h3 className="mb-s-300 sm:mb-m-500 gap-s-200 text-small sm:text-body text-txt-100 flex items-center font-semibold">
								<TrendingUp className="text-acc-100 h-5 w-5" />
								{tTrade("detail.classification")}
							</h3>

							{trade.strategy && (
								<div className="mb-m-400">
									<p className="text-tiny text-txt-300">{tTrade("strategy")}</p>
									<p className="mt-s-100 text-body text-txt-100">
										{trade.strategy.name}
									</p>
								</div>
							)}

							{tags.length > 0 && (
								<div className="gap-s-200 flex flex-wrap">
									{setupTags.map((tag) => (
										<Badge
											id={`badge-setup-tag-${tag.id}`}
											key={tag.id}
											className="bg-trade-buy/10 text-trade-buy"
										>
											{tag.name}
										</Badge>
									))}
									{mistakeTags.map((tag) => (
										<Badge
											id={`badge-mistake-tag-${tag.id}`}
											key={tag.id}
											className="bg-warning/10 text-warning"
										>
											{tag.name}
										</Badge>
									))}
									{generalTags.map((tag) => (
										<Badge
											id={`badge-general-tag-${tag.id}`}
											key={tag.id}
											className="bg-acc-100/10 text-acc-100"
										>
											{tag.name}
										</Badge>
									))}
								</div>
							)}
						</Card>
					)}

					{/* Journal Notes */}
					{(trade.preTradeThoughts ||
						trade.postTradeReflection ||
						trade.lessonLearned ||
						trade.disciplineNotes) && (
						<Card
							id="trade-detail-journal-notes"
							className="p-m-400 sm:p-m-500 lg:p-m-600"
						>
							<h3 className="mb-s-300 sm:mb-m-500 text-small sm:text-body text-txt-100 font-semibold">
								{tTrade("detail.journalNotes")}
							</h3>

							<div className="space-y-m-400 sm:space-y-m-500">
								{trade.preTradeThoughts && (
									<div>
										<p className="text-tiny text-txt-300 font-medium">
											{tTrade("preTradeThoughts")}
										</p>
										<p className="mt-s-200 text-small text-txt-100">
											{trade.preTradeThoughts}
										</p>
									</div>
								)}

								{trade.postTradeReflection && (
									<>
										{trade.preTradeThoughts && (
											<Separator id="separator-pre-post-trade" />
										)}
										<div>
											<p className="text-tiny text-txt-300 font-medium">
												{tTrade("postTradeReflection")}
											</p>
											<p className="mt-s-200 text-small text-txt-100">
												{trade.postTradeReflection}
											</p>
										</div>
									</>
								)}

								{trade.lessonLearned && (
									<>
										<Separator id="separator-lesson-learned" />
										<div>
											<p className="text-tiny text-txt-300 font-medium">
												{tTrade("lessonLearned")}
											</p>
											<p className="mt-s-200 text-small text-txt-100">
												{trade.lessonLearned}
											</p>
										</div>
									</>
								)}

								{trade.disciplineNotes && (
									<>
										<Separator id="separator-discipline-notes" />
										<div className="bg-warning/10 p-s-300 sm:p-m-400 rounded-lg">
											<p className="text-tiny text-warning font-medium">
												{tTrade("detail.disciplineNotes")}
											</p>
											<p className="mt-s-200 text-small text-txt-100">
												{trade.disciplineNotes}
											</p>
										</div>
									</>
								)}
							</div>
						</Card>
					)}
				</div>
			</div>
		</div>
	)
}

export { TradeDetailPage as default }
