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
			className="border-bg-300 bg-bg-200 p-s-300 min-w-0 flex-1 shrink-0 rounded-lg border sm:min-w-[140px]"
			role="listitem"
			aria-label={`${quote.name}: ${formatPrice(quote.price)}${isClosed ? "" : `, ${formatChangePercent(quote.changePercent)}`}`}
		>
			<div className="gap-s-200 flex items-center justify-between">
				<span className="text-tiny text-txt-200 flex min-w-0 items-center gap-1.5 truncate font-medium">
					{quote.flag ? (
						<span className="shrink-0" aria-hidden="true">
							{quote.flag}
						</span>
					) : null}
					{quote.name}
				</span>
				{isClosed ? (
					<span className="text-tiny text-txt-300/50 shrink-0">
						{t("closed")}
					</span>
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
			<span className="text-txt-100 mt-s-100 text-h3 block font-semibold">
				{formatPrice(quote.price)}
			</span>
		</div>
	)
})
HeroQuoteCard.displayName = "HeroQuoteCard"
