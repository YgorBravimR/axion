"use client"

import { useMemo, memo } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { formatCentsAsCurrency } from "@/lib/money"
import type { BacktestTrade, DayBreakdown } from "@/types/backtest"

interface BacktestHawksResultsPanelProps {
	trades: BacktestTrade[]
	dayBreakdown: DayBreakdown[]
	currency?: string
}

type SessionKey = "morning" | "afternoon" | "close"

interface SessionBucket {
	key: SessionKey
	trades: number
	wins: number
	pnlCents: number
	rMultipleSum: number
}

// BR market data is stored in UTC after a +3h ingest shift. To slot a trade
// into its BR-local trading session we recover the local minute-of-day by
// subtracting 180 minutes from the UTC clock; 09:00–17:30 BR maps to a
// stable 540–1050 window with no day-wrap.
const BR_OFFSET_MINUTES = 180
const SESSION_MORNING_END = 12 * 60
const SESSION_AFTERNOON_END = 15 * 60 + 30

const classifySession = (entryTime: string): SessionKey => {
	const date = new Date(entryTime)
	const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes()
	const brMinutes = utcMinutes - BR_OFFSET_MINUTES
	if (brMinutes < SESSION_MORNING_END) {
		return "morning"
	}
	if (brMinutes < SESSION_AFTERNOON_END) {
		return "afternoon"
	}
	return "close"
}

const BacktestHawksResultsPanel = memo(
	({
		trades,
		dayBreakdown,
		currency = "BRL",
	}: BacktestHawksResultsPanelProps) => {
		const t = useTranslations("backtest.hawksPanel")

		const sessions = useMemo<SessionBucket[]>(() => {
			const make = (key: SessionKey): SessionBucket => ({
				key,
				trades: 0,
				wins: 0,
				pnlCents: 0,
				rMultipleSum: 0,
			})
			const buckets: Record<SessionKey, SessionBucket> = {
				morning: make("morning"),
				afternoon: make("afternoon"),
				close: make("close"),
			}
			for (const trade of trades) {
				const bucket = buckets[classifySession(trade.entryTime)]
				bucket.trades += 1
				if (trade.netPnlCents > 0) {
					bucket.wins += 1
				}
				bucket.pnlCents += trade.netPnlCents
				bucket.rMultipleSum += trade.rMultiple
			}
			return [buckets.morning, buckets.afternoon, buckets.close]
		}, [trades])

		const activity = useMemo(() => {
			const tradingDays = dayBreakdown.filter((d) => d.trades > 0)
			const counts = tradingDays.map((d) => d.trades)
			const total = counts.reduce((a, b) => a + b, 0)
			const avgPerDay = tradingDays.length > 0 ? total / tradingDays.length : 0
			const maxPerDay = counts.length > 0 ? Math.max(...counts) : 0
			const one = counts.filter((c) => c === 1).length
			const two = counts.filter((c) => c === 2).length
			const threePlus = counts.filter((c) => c >= 3).length
			return { avgPerDay, maxPerDay, one, two, threePlus }
		}, [dayBreakdown])

		const { best, worst } = useMemo(() => {
			const tradingDays = dayBreakdown.filter((d) => d.trades > 0)
			if (tradingDays.length === 0) {
				return { best: null, worst: null }
			}
			let bestDay = tradingDays[0]
			let worstDay = tradingDays[0]
			for (const d of tradingDays) {
				if (bestDay && d.pnlCents > bestDay.pnlCents) {
					bestDay = d
				}
				if (worstDay && d.pnlCents < worstDay.pnlCents) {
					worstDay = d
				}
			}
			return { best: bestDay ?? null, worst: worstDay ?? null }
		}, [dayBreakdown])

		if (trades.length === 0) {
			return null
		}

		return (
			<div className="border-bg-300 bg-bg-200 p-m-400 space-y-m-500 rounded-lg border">
				<div className="gap-s-300 flex items-baseline justify-between">
					<div>
						<h3 className="text-h3 text-txt-100 font-semibold">{t("title")}</h3>
						<p className="text-small text-txt-300 mt-s-100">{t("subtitle")}</p>
					</div>
					<Badge
						id="badge-hawks-panel"
						variant="outline"
						className="text-tiny shrink-0"
					>
						HAWKS
					</Badge>
				</div>

				<section className="space-y-s-300">
					<h4 className="text-small text-txt-200 font-medium">
						{t("session.heading")}
					</h4>
					<div className="gap-s-300 grid grid-cols-1 sm:grid-cols-3">
						{sessions.map((s) => {
							const avgR = s.trades > 0 ? s.rMultipleSum / s.trades : 0
							const winRate = s.trades > 0 ? (s.wins / s.trades) * 100 : 0
							const pnlTone =
								s.pnlCents > 0
									? "text-trade-buy"
									: s.pnlCents < 0
										? "text-trade-sell"
										: "text-txt-100"
							return (
								<div
									key={s.key}
									className="border-bg-300 bg-bg-100 p-s-300 space-y-s-200 rounded-lg border"
								>
									<div className="gap-s-200 flex items-baseline justify-between">
										<p className="text-small text-txt-100 font-medium">
											{t(`session.${s.key}`)}
										</p>
										<p className="text-tiny text-txt-300 font-mono">
											{t(`session.${s.key}Range`)}
										</p>
									</div>
									{s.trades === 0 ? (
										<p className="text-small text-txt-300">
											{t("session.noTrades")}
										</p>
									) : (
										<div className="space-y-s-100">
											<p className="text-h3 text-txt-100 font-mono font-semibold">
												{s.trades}{" "}
												<span className="text-small text-txt-300 font-sans font-normal">
													{t("session.trades")}
												</span>
											</p>
											<p
												className={`text-small font-mono font-medium ${pnlTone}`}
											>
												{formatCentsAsCurrency(s.pnlCents, currency)}
											</p>
											<div className="gap-s-200 flex items-baseline justify-between">
												<p className="text-tiny text-txt-300 font-mono">
													{avgR > 0 ? "+" : ""}
													{avgR.toFixed(2)}R {t("session.avgR")}
												</p>
												<p className="text-tiny text-txt-300 font-mono">
													{winRate.toFixed(0)}% {t("session.winRate")}
												</p>
											</div>
										</div>
									)}
								</div>
							)
						})}
					</div>
				</section>

				<section className="space-y-s-300">
					<h4 className="text-small text-txt-200 font-medium">
						{t("activity.heading")}
					</h4>
					<div className="gap-s-300 grid grid-cols-2 sm:grid-cols-5">
						<div className="border-bg-300 bg-bg-100 p-s-300 space-y-s-100 rounded-lg border">
							<p className="text-tiny text-txt-300">
								{t("activity.avgTradesPerDay")}
							</p>
							<p className="text-h3 text-txt-100 font-mono font-semibold">
								{activity.avgPerDay.toFixed(1)}
							</p>
						</div>
						<div className="border-bg-300 bg-bg-100 p-s-300 space-y-s-100 rounded-lg border">
							<p className="text-tiny text-txt-300">
								{t("activity.maxTradesPerDay")}
							</p>
							<p className="text-h3 text-txt-100 font-mono font-semibold">
								{activity.maxPerDay}
							</p>
						</div>
						<div className="border-bg-300 bg-bg-100 p-s-300 space-y-s-100 rounded-lg border">
							<p className="text-tiny text-txt-300">{t("activity.oneTrade")}</p>
							<p className="text-h3 text-txt-100 font-mono font-semibold">
								{activity.one}
								<span className="text-small text-txt-300 ml-s-100 font-sans font-normal">
									{t("activity.days")}
								</span>
							</p>
						</div>
						<div className="border-bg-300 bg-bg-100 p-s-300 space-y-s-100 rounded-lg border">
							<p className="text-tiny text-txt-300">
								{t("activity.twoTrades")}
							</p>
							<p className="text-h3 text-txt-100 font-mono font-semibold">
								{activity.two}
								<span className="text-small text-txt-300 ml-s-100 font-sans font-normal">
									{t("activity.days")}
								</span>
							</p>
						</div>
						<div className="border-bg-300 bg-bg-100 p-s-300 space-y-s-100 rounded-lg border">
							<p className="text-tiny text-txt-300">
								{t("activity.threePlusTrades")}
							</p>
							<p
								className={`text-h3 font-mono font-semibold ${
									activity.threePlus > 0 ? "text-trade-sell" : "text-txt-100"
								}`}
							>
								{activity.threePlus}
								<span className="text-small text-txt-300 ml-s-100 font-sans font-normal">
									{t("activity.days")}
								</span>
							</p>
						</div>
					</div>
				</section>

				<section className="space-y-s-300">
					<h4 className="text-small text-txt-200 font-medium">
						{t("bestWorst.heading")}
					</h4>
					<div className="gap-s-300 grid grid-cols-1 sm:grid-cols-2">
						{best ? (
							<div className="border-bg-300 bg-bg-100 p-s-300 space-y-s-100 rounded-lg border">
								<p className="text-tiny text-txt-300">{t("bestWorst.best")}</p>
								<p className="text-body text-txt-100 font-mono">
									{best.dayKey}
								</p>
								<p className="text-h3 text-trade-buy font-mono font-semibold">
									{formatCentsAsCurrency(best.pnlCents, currency)}
								</p>
								<p className="text-tiny text-txt-300">
									{best.trades} {t("bestWorst.tradesSuffix")}
								</p>
							</div>
						) : null}
						{worst ? (
							<div className="border-bg-300 bg-bg-100 p-s-300 space-y-s-100 rounded-lg border">
								<p className="text-tiny text-txt-300">{t("bestWorst.worst")}</p>
								<p className="text-body text-txt-100 font-mono">
									{worst.dayKey}
								</p>
								<p className="text-h3 text-trade-sell font-mono font-semibold">
									{formatCentsAsCurrency(worst.pnlCents, currency)}
								</p>
								<p className="text-tiny text-txt-300">
									{worst.trades} {t("bestWorst.tradesSuffix")}
								</p>
							</div>
						) : null}
					</div>
				</section>
			</div>
		)
	}
)
BacktestHawksResultsPanel.displayName = "BacktestHawksResultsPanel"

export { BacktestHawksResultsPanel }
