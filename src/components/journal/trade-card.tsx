"use client"

import { Link } from "@/i18n/routing"
import {
	ArrowUpRight,
	ArrowDownRight,
	Calendar,
	TrendingUp,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/dates"
import { formatCurrency, formatRMultiple } from "@/lib/calculations"
import { fromCents } from "@/lib/money"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ColoredValue } from "@/components/shared"
import type { TradeWithRelations } from "@/app/actions/trades"

interface TradeCardProps {
	trade: TradeWithRelations
	className?: string
}

export const TradeCard = ({ trade, className }: TradeCardProps) => {
	const t = useTranslations("trade")

	// pnl is stored in cents, convert to dollars for display
	const pnl = fromCents(trade.pnl)
	const realizedR = Number(trade.realizedRMultiple) || 0
	const isWin = trade.outcome === "win"
	const isLoss = trade.outcome === "loss"
	const isLong = trade.direction === "long"

	const tags = trade.tradeTags?.map((tt) => tt.tag) || []
	const setupTags = tags.filter((tag) => tag.type === "setup")
	const mistakeTags = tags.filter((tag) => tag.type === "mistake")

	return (
		<Link href={`/journal/${trade.id}`}>
			<Card
				id={`trade-card-${trade.id}`}
				className={cn(
					"p-s-300 sm:p-m-400 lg:p-m-500 hover:border-acc-100/50 hover:bg-bg-200/80 transition-colors",
					className
				)}
			>
				<div className="gap-m-400 flex items-start justify-between">
					{/* Left: Asset and Direction */}
					<div className="gap-m-400 flex items-center">
						<div
							className={cn(
								"flex h-10 w-10 items-center justify-center rounded-lg",
								isLong ? "bg-action-buy-muted" : "bg-action-sell-muted"
							)}
						>
							{isLong ? (
								<ArrowUpRight className="text-action-buy h-5 w-5" />
							) : (
								<ArrowDownRight className="text-action-sell h-5 w-5" />
							)}
						</div>
						<div>
							<div className="gap-s-200 flex items-center">
								<span className="text-body text-txt-100 font-semibold">
									{trade.asset}
								</span>
								<Badge
									id={`trade-card-direction-${trade.id}`}
									variant="outline"
									className={cn(
										"text-tiny",
										isLong
											? "border-trade-buy/30 text-trade-buy"
											: "border-trade-sell/30 text-trade-sell"
									)}
								>
									{isLong
										? t("direction.long").toUpperCase()
										: t("direction.short").toUpperCase()}
								</Badge>
								{trade.timeframe && (
									<Badge id={`trade-card-timeframe-${trade.id}`} variant="secondary" className="text-tiny">
										{trade.timeframe.name}
									</Badge>
								)}
							</div>
							<div className="mt-s-100 gap-s-200 text-tiny text-txt-300 flex items-center">
								<Calendar className="h-3 w-3" />
								<span>{formatDateTime(trade.entryDate)}</span>
							</div>
						</div>
					</div>

					{/* Right: P&L and R */}
					<div className="text-right">
						<ColoredValue
							value={pnl}
							showSign
							formatFn={(v) => formatCurrency(v)}
							className="text-body font-semibold"
						/>
						{realizedR !== 0 && (
							<ColoredValue
								value={realizedR}
								type="r-multiple"
								showSign
								size="sm"
								className="mt-s-100"
							/>
						)}
					</div>
				</div>

				{/* Tags */}
				{(setupTags.length > 0 || mistakeTags.length > 0) && (
					<div className="mt-m-400 gap-s-200 flex flex-wrap">
						{setupTags.map((tag) => (
							<Badge
								id={`badge-setup-${tag.id}`}
								key={tag.id}
								variant="secondary"
								className="bg-trade-buy/10 text-tiny text-trade-buy"
							>
								{tag.name}
							</Badge>
						))}
						{mistakeTags.map((tag) => (
							<Badge
								id={`badge-mistake-${tag.id}`}
								key={tag.id}
								variant="secondary"
								className="bg-warning/10 text-tiny text-warning"
							>
								{tag.name}
							</Badge>
						))}
					</div>
				)}

				{/* Strategy */}
				{trade.strategy && (
					<div className="mt-m-400 gap-s-200 text-tiny text-txt-300 flex items-center">
						<TrendingUp className="h-3 w-3" />
						<span>{trade.strategy.name}</span>
					</div>
				)}

				{/* Quick metrics */}
				<div className="mt-s-300 sm:mt-m-400 gap-s-300 sm:gap-m-400 border-bg-300 pt-s-300 sm:pt-m-400 grid grid-cols-1 sm:grid-cols-3 border-t">
					<div>
						<span className="text-tiny text-txt-300">{t("entry")}</span>
						<p className="text-small text-txt-100">
							${Number(trade.entryPrice).toFixed(2)}
						</p>
					</div>
					<div>
						<span className="text-tiny text-txt-300">{t("exit")}</span>
						<p className="text-small text-txt-100">
							{trade.exitPrice
								? `$${Number(trade.exitPrice).toFixed(2)}`
								: t("openPosition")}
						</p>
					</div>
					<div>
						<span className="text-tiny text-txt-300">{t("size")}</span>
						<p className="text-small text-txt-100">
							{Number(trade.positionSize).toLocaleString()}
						</p>
					</div>
				</div>
			</Card>
		</Link>
	)
}
