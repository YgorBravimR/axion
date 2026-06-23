import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
	ArrowUpRight,
	ArrowDownRight,
	Calendar,
	ChevronLeft,
	ChevronRight,
	Edit,
	Target,
	TrendingUp,
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
	TradeDetailLayout,
	RatingBadge,
	FollowedPlanBadge,
	TradeTag,
	type RatingGrade,
} from "@/components/journal"
import { getAdjacentTrades, getTrade } from "@/app/actions/trades"
import { getTradeConditions } from "@/app/actions/trade-conditions"
import { getAssetBySymbol } from "@/app/actions/assets"
import {
	getCandleDataForAsset,
	getCandlesForTrade,
} from "@/app/actions/candle-query"
import { getActiveAccountModeForUser } from "@/lib/hawks/account-context"
import { DeleteTradeButton } from "./delete-button"
import { TradeDetailGuide } from "@/components/journal/trade-detail-guide"
import { AskButton } from "@/components/ai-assistant/ask-button"
import type { BacktestTrade } from "@/types/backtest"

interface TradeDetailPageProps {
	params: Promise<{ id: string }>
}

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TradeDetailPage = async ({ params }: TradeDetailPageProps) => {
	const { id } = await params

	if (!UUID_RE.test(id)) {
		notFound()
	}

	const tTrade = await getTranslations("trade")
	const result = await getTrade(id)

	if (result.status === "error" || !result.data) {
		notFound()
	}

	const trade = result.data

	// Fetch asset data + candle availability + condition snapshot in parallel.
	// `accountMode` decides whether the chart switches to the hawks
	// triple-screen layout (5m/15m/60m renko panes) or the default single-pane
	// candle chart.
	const [asset, assetCandleSource, conditionsResult, accountMode, adjacent] =
		await Promise.all([
			getAssetBySymbol(trade.asset),
			getCandleDataForAsset(trade.asset),
			getTradeConditions(trade.id),
			getActiveAccountModeForUser(),
			getAdjacentTrades(trade.id),
		])

	// Prefer the trade's own timeframe when present — it's the source of truth
	// for which renko/time series the chart should render. Falls back to the
	// asset-level default (which itself prefers hawk_5m_win in hawks mode).
	const candleSource = assetCandleSource
		? trade.timeframeId
			? { assetId: assetCandleSource.assetId, timeframeId: trade.timeframeId }
			: assetCandleSource
		: null

	const conditions =
		conditionsResult.status === "success" && conditionsResult.data
			? conditionsResult.data
			: []
	const conditionsMetCount = conditions.filter((c) => c.met).length
	const conditionsTotalCount = conditions.length

	// In hawks WIN mode the triple-screen inspector owns the chart — skip the
	// single-pane candle fetch entirely so we don't pay for parquet I/O the
	// page will never render.
	const willRenderTripleScreen =
		accountMode === "hawks" && trade.asset.toUpperCase() === "WIN"
	const candleResult =
		candleSource && !willRenderTripleScreen
			? await getCandlesForTrade({
					assetId: candleSource.assetId,
					timeframeId: candleSource.timeframeId,
					entryDate: trade.entryDate.toISOString(),
					exitDate: trade.exitDate?.toISOString() ?? null,
				})
			: null

	const hasChart =
		candleResult?.status === "success" &&
		candleResult.data &&
		candleResult.data.candles.length > 0

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

	// In hawks mode, the chart switches to the triple-screen renko inspector
	// (5m / 15m / 60m panes). The inspector fetches its own data client-side
	// via `getInspectorWindow`; here we only need to project the journal
	// trade into the `BacktestTrade` shape it expects.
	// Triple-screen renko panes only exist for WIN — `hawk_5m_win`,
	// `hawk_15m_win`, `hawk_60m_win`. WDO and other hawks-mode trades fall
	// back to the regular single-pane chart. Open trades (no exit yet) still
	// render — the inspector treats the entry as both anchor and current
	// price so the trade overlay shows just the entry marker.
	const exitDateForInspector = trade.exitDate ?? trade.entryDate
	const exitPriceForInspector =
		trade.exitPrice !== null
			? Number(trade.exitPrice)
			: Number(trade.entryPrice)
	const tripleScreenTrade: BacktestTrade | null = willRenderTripleScreen
		? {
				id: 0,
				dayKey: trade.entryDate.toISOString().slice(0, 10),
				direction: trade.direction,
				entryPrice: Number(trade.entryPrice),
				entryTime: trade.entryDate.toISOString(),
				exitPrice: exitPriceForInspector,
				exitTime: exitDateForInspector.toISOString(),
				exitReason: "target1",
				contracts: Number(trade.positionSize),
				grossPnlCents: Number(trade.pnl ?? 0),
				slippageCostCents: 0,
				netPnlCents: Number(trade.pnl ?? 0),
				rMultiple: Number(trade.realizedRMultiple) || 0,
				label: trade.asset,
			}
		: null

	// Build chart data if candle data is available
	const chartData =
		hasChart && candleResult?.data
			? {
					trade: {
						id: trade.id,
						direction: trade.direction,
						entryDate: trade.entryDate.toISOString(),
						exitDate: trade.exitDate?.toISOString() ?? null,
						entryPrice: Number(trade.entryPrice),
						exitPrice: trade.exitPrice ? Number(trade.exitPrice) : null,
						stopLoss: trade.stopLoss ? Number(trade.stopLoss) : null,
						takeProfit: trade.takeProfit ? Number(trade.takeProfit) : null,
						pnl: trade.pnl ? Number(trade.pnl) : null,
						outcome: trade.outcome,
						asset: trade.asset,
						positionSize: Number(trade.positionSize),
					},
					executions: (trade.executions ?? []).map((e) => ({
						type: e.executionType as "entry" | "exit",
						price: Number(e.price),
						quantity: Number(e.quantity),
						timestamp: e.executionDate.toISOString(),
					})),
					candles: candleResult.data.candles,
					indicatorGroups: candleResult.data.indicatorGroups,
					fullTrade: {
						preTradeThoughts: trade.preTradeThoughts,
						postTradeReflection: trade.postTradeReflection,
						lessonLearned: trade.lessonLearned,
						disciplineNotes: trade.disciplineNotes,
						strategy: trade.strategy,
						rating: trade.rating,
						followedPlan: trade.followedPlan,
						mfe: trade.mfe,
						mae: trade.mae,
						plannedRMultiple: trade.plannedRMultiple,
						realizedRMultiple: trade.realizedRMultiple,
						plannedRiskAmount: trade.plannedRiskAmount
							? Number(trade.plannedRiskAmount)
							: null,
						executionMode: trade.executionMode,
						tradeTags: trade.tradeTags,
						timeframe: trade.timeframe,
					},
					tickSize: asset ? Number(asset.tickSize) : undefined,
					tickValue: asset ? Number(asset.tickValue) / 100 : undefined,
				}
			: null

	const tripleScreenJournalTrade = willRenderTripleScreen
		? {
				id: trade.id,
				direction: trade.direction,
				entryDate: trade.entryDate.toISOString(),
				exitDate: trade.exitDate?.toISOString() ?? null,
				entryPrice: Number(trade.entryPrice),
				exitPrice: trade.exitPrice ? Number(trade.exitPrice) : null,
				stopLoss: trade.stopLoss ? Number(trade.stopLoss) : null,
				takeProfit: trade.takeProfit ? Number(trade.takeProfit) : null,
				pnl: trade.pnl ? Number(trade.pnl) : null,
				outcome: trade.outcome,
				asset: trade.asset,
				positionSize: Number(trade.positionSize),
			}
		: null
	const tripleScreenExecutions = willRenderTripleScreen
		? (trade.executions ?? []).map((e) => ({
				type: e.executionType as "entry" | "exit",
				price: Number(e.price),
				quantity: Number(e.quantity),
				timestamp: e.executionDate.toISOString(),
			}))
		: []
	const tripleScreenFullTrade = willRenderTripleScreen
		? {
				preTradeThoughts: trade.preTradeThoughts,
				postTradeReflection: trade.postTradeReflection,
				lessonLearned: trade.lessonLearned,
				disciplineNotes: trade.disciplineNotes,
				strategy: trade.strategy,
				rating: trade.rating,
				followedPlan: trade.followedPlan,
				mfe: trade.mfe,
				mae: trade.mae,
				plannedRMultiple: trade.plannedRMultiple,
				realizedRMultiple: trade.realizedRMultiple,
				plannedRiskAmount: trade.plannedRiskAmount
					? Number(trade.plannedRiskAmount)
					: null,
				executionMode: trade.executionMode,
				tradeTags: trade.tradeTags,
				timeframe: trade.timeframe,
			}
		: null
	const tripleScreen =
		willRenderTripleScreen &&
		tripleScreenTrade &&
		tripleScreenJournalTrade &&
		tripleScreenFullTrade
			? {
					trade: tripleScreenTrade,
					assetSymbol: trade.asset,
					journalTrade: tripleScreenJournalTrade,
					executions: tripleScreenExecutions,
					fullTrade: tripleScreenFullTrade,
					tickSize: asset ? Number(asset.tickSize) : undefined,
					tickValue: asset ? Number(asset.tickValue) / 100 : undefined,
				}
			: null

	return (
		<TradeDetailLayout
			chartData={chartData}
			tripleScreen={tripleScreen}
			adjacent={{ prevId: adjacent.prevId, nextId: adjacent.nextId }}
		>
			<div className="flex h-full flex-col">
				<TradeDetailGuide />
				<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-auto">
					<div className="space-y-l-800">
						{/* ========== ANCHOR ROW: P&L + R + Outcome ========== */}
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
										<div className="gap-s-300 flex flex-wrap items-center">
											<h2 className="text-h2 text-txt-100 font-bold">
												{trade.asset}
											</h2>
											<Badge
												id="trade-detail-direction"
												variant="outline"
												className={cn(
													isLong
														? "border-action-buy/30 text-action-buy"
														: "border-action-sell/30 text-action-sell"
												)}
											>
												{isLong
													? tTrade("direction.long").toUpperCase()
													: tTrade("direction.short").toUpperCase()}
											</Badge>
											{trade.timeframe && (
												<Badge id="trade-detail-timeframe" variant="secondary">
													{trade.timeframe.name}
												</Badge>
											)}
										</div>
										<div className="mt-s-200 gap-m-400 text-small text-txt-300 flex items-center">
											<div className="gap-s-200 flex items-center">
												<Calendar className="h-4 w-4" aria-hidden="true" />
												<span>{formatDateTime(trade.entryDate)}</span>
											</div>
											{trade.exitDate && (
												<>
													<span aria-hidden="true">→</span>
													<span>{formatDateTime(trade.exitDate)}</span>
												</>
											)}
										</div>
									</div>
								</div>

								<div className="gap-s-300 flex items-center self-end sm:self-auto">
									<Button
										id="trade-detail-prev"
										asChild={Boolean(adjacent.prevId)}
										variant="ghost"
										size="icon"
										className="h-9 w-9"
										disabled={!adjacent.prevId}
										aria-label={tTrade("prevTrade")}
									>
										{adjacent.prevId ? (
											<Link href={`/journal/${adjacent.prevId}`}>
												<ChevronLeft className="h-4 w-4" aria-hidden="true" />
											</Link>
										) : (
											<ChevronLeft className="h-4 w-4" aria-hidden="true" />
										)}
									</Button>
									<Button
										id="trade-detail-next"
										asChild={Boolean(adjacent.nextId)}
										variant="ghost"
										size="icon"
										className="h-9 w-9"
										disabled={!adjacent.nextId}
										aria-label={tTrade("nextTrade")}
									>
										{adjacent.nextId ? (
											<Link href={`/journal/${adjacent.nextId}`}>
												<ChevronRight className="h-4 w-4" aria-hidden="true" />
											</Link>
										) : (
											<ChevronRight className="h-4 w-4" aria-hidden="true" />
										)}
									</Button>
									<Button
										id="trade-detail-edit"
										asChild
										variant="ghost"
										size="icon"
										className="h-9 w-9"
										aria-label={tTrade("editTrade")}
									>
										<Link href={`/journal/${trade.id}/edit`}>
											<Edit className="h-4 w-4" aria-hidden="true" />
										</Link>
									</Button>
									<DeleteTradeButton tradeId={trade.id} />
									<AskButton
										surface="trade_detail"
										contextRefId={trade.id.toString()}
									/>
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

							{/* Outcome Badges */}
							<div className="mt-m-500 gap-s-300 flex flex-wrap items-center">
								{isWin && (
									<Badge
										id="trade-detail-outcome-win"
										className="bg-trade-buy/20 text-trade-buy"
									>
										<CheckCircle
											className="mr-s-100 h-3 w-3"
											aria-hidden="true"
										/>
										{tTrade("outcome.winner")}
									</Badge>
								)}
								{isLoss && (
									<Badge
										id="trade-detail-outcome-loss"
										className="bg-trade-sell/20 text-trade-sell"
									>
										<XCircle className="mr-s-100 h-3 w-3" aria-hidden="true" />
										{tTrade("outcome.loser")}
									</Badge>
								)}
								{trade.outcome === "breakeven" && (
									<Badge
										id="trade-detail-outcome-breakeven"
										variant="secondary"
									>
										{tTrade("outcome.breakeven")}
									</Badge>
								)}
								{trade.followedPlan !== null && (
									<FollowedPlanBadge
										id={
											trade.followedPlan
												? "trade-detail-followed-plan"
												: "trade-detail-discipline-breach"
										}
										followed={trade.followedPlan}
									/>
								)}
								{trade.rating && (
									<RatingBadge
										id="trade-detail-rating"
										grade={trade.rating as RatingGrade}
										withLabel
									/>
								)}
							</div>
						</Card>

						{/* ========== EXECUTION BAND: Prices, SL/TP, MFE/MAE ========== */}
						<div id="trade-execution-band" className="space-y-m-400">
							<div className="px-m-400 sm:px-m-500 lg:px-m-600">
								<h3 className="text-small sm:text-body text-txt-100 font-semibold">
									{tTrade("detail.executionDetails") ?? "Execution Details"}
								</h3>
							</div>

							{/* Prices & Risk Grid (no per-item card chrome) */}
							<div
								id="trade-detail-metrics"
								className="gap-s-300 sm:gap-m-400 lg:gap-m-500 px-m-400 sm:px-m-500 lg:px-m-600 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
							>
								<div className="min-w-0">
									<TradeMetric
										label={tTrade("entryPrice")}
										value={`$${Number(trade.entryPrice).toFixed(2)}`}
										size="lg"
									/>
								</div>
								<div className="min-w-0">
									<TradeMetric
										label={tTrade("exitPrice")}
										value={
											trade.exitPrice
												? `$${Number(trade.exitPrice).toFixed(2)}`
												: tTrade("outcome.open")
										}
										size="lg"
									/>
								</div>
								<div className="min-w-0">
									<TradeMetric
										label={tTrade("positionSize")}
										value={Number(trade.positionSize).toLocaleString()}
										size="lg"
									/>
								</div>
								<div className="min-w-0">
									<TradeMetric
										label={tTrade("riskAmount")}
										value={
											trade.plannedRiskAmount
												? formatCurrency(fromCents(trade.plannedRiskAmount))
												: "-"
										}
										size="lg"
									/>
								</div>
							</div>

							{/* Executions Section (for scaled mode) */}
							<div className="px-m-400 sm:px-m-500 lg:px-m-600">
								<TradeExecutionsSection
									tradeId={trade.id}
									executionMode={trade.executionMode}
									direction={trade.direction}
									executions={trade.executions ?? []}
									tickSize={asset ? Number(asset.tickSize) : undefined}
									tickValue={asset ? Number(asset.tickValue) / 100 : undefined}
								/>
							</div>

							{/* R-Multiple + MFE/MAE (no card wrapper, contained in band) */}
							{(plannedR > 0 || realizedR !== 0 || trade.mfe || trade.mae) && (
								<div
									id="trade-detail-risk-and-excursion"
									className="gap-m-400 sm:gap-m-500 px-m-400 sm:px-m-500 lg:px-m-600 grid grid-cols-1 md:grid-cols-2"
								>
									{(plannedR > 0 || realizedR !== 0) && (
										<div>
											<h4 className="mb-m-400 gap-s-200 text-small text-txt-100 flex items-center font-semibold">
												<Target
													className="text-acc-100 h-4 w-4"
													aria-hidden="true"
												/>
												{tTrade("detail.riskRewardAnalysis")}
											</h4>
											<RMultipleBar
												planned={plannedR || undefined}
												actual={realizedR}
											/>
										</div>
									)}

									{(trade.mfe || trade.mae) && (
										<div>
											<h4 className="mb-m-400 text-small text-txt-100 font-semibold">
												{tTrade("detail.tradeExcursion")}
											</h4>
											<div className="gap-s-300 sm:gap-m-400 flex flex-col">
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
														<p className="text-tiny text-txt-300">
															{tTrade("detail.mae")}
														</p>
														<p className="mt-s-100 text-body text-trade-sell font-semibold">
															${Number(trade.mae).toFixed(2)}
														</p>
													</div>
												)}
											</div>
										</div>
									)}
								</div>
							)}
						</div>

						{/* ========== PROCESS BAND: Strategy, Conditions, Tags ========== */}
						{(trade.strategy ||
							tags.length > 0 ||
							conditionsTotalCount > 0) && (
							<div id="trade-process-band" className="space-y-m-400">
								<div className="px-m-400 sm:px-m-500 lg:px-m-600">
									<h3 className="gap-s-200 text-small sm:text-body text-txt-100 flex items-center font-semibold">
										<TrendingUp
											className="text-txt-300 h-4 w-4"
											aria-hidden="true"
										/>
										{tTrade("detail.classification")}
									</h3>
								</div>

								<div className="space-y-m-400 px-m-400 sm:px-m-500 lg:px-m-600">
									{trade.strategy && (
										<div>
											<p className="text-tiny text-txt-300">
												{tTrade("strategy")}
											</p>
											<p className="mt-s-100 text-body text-txt-100">
												{trade.strategy.name}
											</p>
										</div>
									)}

									{conditionsTotalCount > 0 && (
										<div id="trade-detail-conditions">
											<div className="gap-s-300 mb-s-200 flex items-center">
												<p className="text-tiny text-txt-300">
													{tTrade("detail.conditions")}
												</p>
												<Badge
													id="trade-detail-conditions-met-badge"
													variant="outline"
													className="text-txt-200"
												>
													{tTrade("detail.conditionsMetBadge", {
														met: conditionsMetCount,
														total: conditionsTotalCount,
													})}
												</Badge>
											</div>
											<ul className="gap-s-100 flex flex-col">
												{conditions.map((c) => (
													<li
														key={c.conditionId}
														className="gap-s-200 text-small text-txt-100 flex items-center"
													>
														{c.met ? (
															<CheckCircle
																className="text-trade-buy h-4 w-4 shrink-0"
																aria-hidden="true"
															/>
														) : (
															<XCircle
																className="text-txt-300 h-4 w-4 shrink-0"
																aria-hidden="true"
															/>
														)}
														<span
															className={cn(
																!c.met && "text-txt-300 line-through"
															)}
														>
															{c.name}
														</span>
													</li>
												))}
											</ul>
										</div>
									)}

									{tags.length > 0 && (
										<div className="gap-s-200 flex flex-wrap">
											{setupTags.map((tag) => (
												<TradeTag
													id={`badge-setup-tag-${tag.id}`}
													key={tag.id}
													kind="setup"
													name={tag.name}
												/>
											))}
											{mistakeTags.map((tag) => (
												<TradeTag
													id={`badge-mistake-tag-${tag.id}`}
													key={tag.id}
													kind="mistake"
													name={tag.name}
												/>
											))}
											{generalTags.map((tag) => (
												<TradeTag
													id={`badge-general-tag-${tag.id}`}
													key={tag.id}
													kind="general"
													name={tag.name}
												/>
											))}
										</div>
									)}
								</div>
							</div>
						)}

						{/* ========== REFLECTION BAND: Journal Notes (retains card chrome) ========== */}
						{(trade.preTradeThoughts ||
							trade.postTradeReflection ||
							trade.lessonLearned ||
							trade.disciplineNotes) && (
							<Card
								id="trade-detail-journal-notes"
								className="p-m-400 sm:p-m-500 lg:p-m-600"
							>
								<h3 className="mb-m-500 text-small sm:text-body text-txt-100 font-semibold">
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
		</TradeDetailLayout>
	)
}

export { TradeDetailPage as default }
