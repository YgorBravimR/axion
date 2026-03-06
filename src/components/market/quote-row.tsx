"use client"

import { useTranslations } from "next-intl"
import type { MarketQuote } from "@/types/market"
import { cn } from "@/lib/utils"
import {
	isQuoteStale,
	formatPrice,
	formatChange,
	formatChangePercent,
} from "@/lib/market/quote-utils"

interface QuoteCardProps {
	quote: MarketQuote
	showAdr?: boolean
	adrQuote?: MarketQuote
}

type BadgeColorScheme = "trade" | "action"

/**
 * Change badge — renders the +/- change with background color.
 *
 * @param colorScheme - "trade" uses green/purple (B3), "action" uses blue/orange (ADR)
 */
const ChangeBadge = ({
	quote,
	isClosed,
	colorScheme = "trade",
}: {
	quote: MarketQuote
	isClosed: boolean
	colorScheme?: BadgeColorScheme
}) => {
	const t = useTranslations("market.status")
	const isPositive = quote.change >= 0
	const isZero = quote.change === 0

	if (isClosed) {
		return (
			<span className="text-tiny text-txt-300/50 px-2 py-0.5 text-right">
				{t("closed")}
			</span>
		)
	}

	const positiveClasses =
		colorScheme === "trade"
			? "bg-trade-buy-muted text-trade-buy"
			: "bg-action-buy-muted text-action-buy"

	const negativeClasses =
		colorScheme === "trade"
			? "bg-trade-sell-muted text-trade-sell"
			: "bg-action-sell-muted text-action-sell"

	return (
		<span
			className={cn(
				"text-tiny inline-flex items-center justify-end gap-1 rounded-md px-2 py-0.5 font-mono whitespace-nowrap",
				isZero && "bg-bg-300/50 text-txt-300",
				!isZero && isPositive && positiveClasses,
				!isZero && !isPositive && negativeClasses
			)}
		>
			<span>{formatChange(quote.change)}</span>
			<span className="text-txt-300/60">|</span>
			<span>{formatChangePercent(quote.changePercent)}</span>
		</span>
	)
}

/**
 * Tabular quote row — uses CSS grid so all columns align across rows.
 *
 * Default layout (5 cols): [flag+name] [price] [high] [low] [change badge]
 * B3 ADR layout (6 cols):  [🇧🇷 name] [🇺🇸 ADR name] [B3 price] [B3 change] [ADR price] [ADR change]
 */
export const QuoteCard = ({
	quote,
	showAdr = false,
	adrQuote,
}: QuoteCardProps) => {
	const hasRange = quote.sessionHigh !== null && quote.sessionLow !== null
	const isClosed = isQuoteStale(quote.updatedAt)
	const isAdrClosed = adrQuote ? isQuoteStale(adrQuote.updatedAt) : true

	// Resolve ADR color class once — reused across name and price columns
	const adrColorClass = (() => {
		if (!adrQuote || isAdrClosed || adrQuote.change === 0) return "text-txt-300"
		return adrQuote.change > 0 ? "text-action-buy" : "text-action-sell"
	})()

	// ── B3 tab: 6-column tabular layout with ADR companion ──────────────────
	if (showAdr) {
		return (
			<div
				className="border-bg-300/50 hover:bg-bg-300/20 grid grid-cols-[2.5fr_2.5fr_1.2fr_1.8fr_1.2fr_1.8fr] items-center gap-x-2 rounded-lg border px-3 py-2 transition-colors"
				role="listitem"
				aria-label={`${quote.name}: ${formatPrice(quote.price)}${adrQuote ? `, ADR: ${formatPrice(adrQuote.price)}` : ""}`}
			>
				{/* Col 1: B3 Name + Symbol */}
				<div className="flex min-w-0 items-center gap-2">
					{quote.flag ? (
						<span className="shrink-0 text-base" aria-hidden="true">
							{quote.flag}
						</span>
					) : null}
					<div className="min-w-0">
						<p className="text-small text-txt-100 truncate font-medium">
							{quote.name}
						</p>
						<p className="text-tiny text-txt-300 truncate">{quote.symbol}</p>
					</div>
				</div>

				{/* Col 2: ADR Name + Symbol or placeholder */}
				{adrQuote ? (
					<div className="flex min-w-0 items-center gap-2">
						<span className="shrink-0 text-base" aria-hidden="true">
							🇺🇸
						</span>
						<div className="min-w-0">
							<p
								className={cn("text-small truncate font-medium", adrColorClass)}
							>
								{adrQuote.name}
							</p>
							<p className="text-tiny text-txt-300/60 truncate">
								{adrQuote.symbol}
							</p>
						</div>
					</div>
				) : (
					<span className="text-small text-txt-300/30 pl-1">—</span>
				)}

				{/* Col 3: B3 Price */}
				<span className="text-small text-txt-100 text-right font-mono tabular-nums">
					{formatPrice(quote.price)}
				</span>

				{/* Col 4: B3 Change badge */}
				<div className="flex justify-end">
					<ChangeBadge quote={quote} isClosed={isClosed} colorScheme="trade" />
				</div>

				{/* Col 5: ADR Price */}
				<span
					className={cn(
						"text-small text-right font-mono tabular-nums",
						adrQuote ? adrColorClass : "text-transparent"
					)}
				>
					{adrQuote ? formatPrice(adrQuote.price) : ""}
				</span>

				{/* Col 6: ADR Change badge */}
				<div className="flex justify-end">
					{adrQuote ? (
						<ChangeBadge
							quote={adrQuote}
							isClosed={isAdrClosed}
							colorScheme="action"
						/>
					) : (
						<span />
					)}
				</div>
			</div>
		)
	}

	// ── Default layout (all other tabs): 5 columns ──────────────────────────
	return (
		<div
			className="border-bg-300/50 hover:bg-bg-300/20 grid grid-cols-[minmax(120px,1.5fr)_auto_auto_auto_auto] items-center gap-x-3 rounded-lg border px-3 py-2 transition-colors"
			role="listitem"
			aria-label={`${quote.name}: ${formatPrice(quote.price)}${isClosed ? "" : `, ${formatChangePercent(quote.changePercent)}`}`}
		>
			{/* Col 1: Flag + Name + Symbol */}
			<div className="flex min-w-0 items-center gap-2">
				{quote.flag ? (
					<span className="shrink-0 text-base" aria-hidden="true">
						{quote.flag}
					</span>
				) : null}
				<div className="min-w-0">
					<p className="text-small text-txt-100 truncate font-medium">
						{quote.name}
					</p>
					<p className="text-tiny text-txt-300 truncate">{quote.symbol}</p>
				</div>
			</div>

			{/* Col 2: Price */}
			<span className="text-small text-txt-100 text-right font-mono tabular-nums">
				{formatPrice(quote.price)}
			</span>

			{/* Col 3: Session High */}
			<span className="text-tiny text-txt-300 hidden text-right font-mono tabular-nums sm:block">
				{!isClosed && hasRange ? `H ${formatPrice(quote.sessionHigh!)}` : ""}
			</span>

			{/* Col 4: Session Low */}
			<span className="text-tiny text-txt-300 hidden text-right font-mono tabular-nums sm:block">
				{!isClosed && hasRange ? `L ${formatPrice(quote.sessionLow!)}` : ""}
			</span>

			{/* Col 5: Change badge or closed label */}
			<ChangeBadge quote={quote} isClosed={isClosed} />
		</div>
	)
}
