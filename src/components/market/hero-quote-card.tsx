"use client"

import { memo } from "react"
import { useTranslations } from "next-intl"
import type { MarketQuote } from "@/types/market"
import { cn } from "@/lib/utils"
import {
	isQuoteStale,
	formatPrice,
	formatChangePercent,
} from "@/lib/market/quote-utils"

interface HeroQuoteCardProps {
	quote: MarketQuote
}

export const HeroQuoteCard = memo(({ quote }: HeroQuoteCardProps) => {
	const t = useTranslations("market.status")
	const isPositive = quote.change >= 0
	const isZero = quote.change === 0
	const isClosed = isQuoteStale(quote.updatedAt)

	return (
		<div
			className={cn(
				"border-bg-300 bg-bg-200 min-w-0 sm:min-w-[140px] shrink-0 flex-1 rounded-lg border p-s-300",
				!isClosed && !isZero && isPositive && "border-l-2 border-l-trade-buy",
				!isClosed && !isZero && !isPositive && "border-l-2 border-l-trade-sell"
			)}
			role="listitem"
			aria-label={`${quote.name}: ${formatPrice(quote.price)}${isClosed ? "" : `, ${formatChangePercent(quote.changePercent)}`}`}
		>
			<div className="flex items-center justify-between gap-s-200">
				<span className="text-tiny text-txt-200 flex min-w-0 items-center gap-1.5 truncate font-medium">
					{quote.flag ? (
						<span className="shrink-0" aria-hidden="true">
							{quote.flag}
						</span>
					) : null}
					{quote.name}
				</span>
				{isClosed ? (
					<span className="text-tiny text-txt-300/50 shrink-0">{t("closed")}</span>
				) : (
					<span
						className={cn(
							"text-tiny shrink-0",
							isZero && "text-txt-300",
							!isZero && isPositive && "text-trade-buy",
							!isZero && !isPositive && "text-trade-sell"
						)}
					>
						{formatChangePercent(quote.changePercent)}
					</span>
				)}
			</div>
			<span className="text-txt-100 mt-s-100 block text-h3 font-semibold">
				{formatPrice(quote.price)}
			</span>
		</div>
	)
})
HeroQuoteCard.displayName = "HeroQuoteCard"
