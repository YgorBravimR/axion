"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { useMarketStatus } from "@/hooks/use-market-status"

/**
 * Compact B3-futures status pill rendered in the desktop top bar.
 *
 * Mirrors TradingView's header convention: green dot + "Open" when the
 * session is live, muted dot + "Opens in XXh" countdown otherwise.
 * Hidden during SSR (status hook returns null) so we never paint a
 * potentially-wrong state before the timezone-aware computation runs.
 */
const MarketStatusPill = () => {
	const t = useTranslations("market")
	const status = useMarketStatus("b3futures")

	if (!status) {
		return null
	}

	const dotClass =
		status.state === "open"
			? "bg-fb-success"
			: status.state === "opening"
				? "bg-warning animate-pulse motion-reduce:animate-none"
				: "bg-txt-300/40"

	const stateLabel =
		status.state === "open"
			? t("status.open")
			: status.state === "opening"
				? t("status.opening")
				: status.minutesUntilOpen !== null && status.minutesUntilOpen > 0
					? t("status.opensIn", {
							hours: String(
								Math.max(Math.round(status.minutesUntilOpen / 60), 1)
							).padStart(2, "0"),
						})
					: t("status.closed")

	const stateColorClass =
		status.state === "open"
			? "text-fb-success"
			: status.state === "opening"
				? "text-warning"
				: "text-txt-300"

	return (
		<div
			id="market-status-pill"
			className="border-bg-300 bg-bg-100 gap-s-200 px-s-300 py-s-100 hidden items-center rounded-full border md:flex"
			role="status"
			aria-label={`${t("status.b3futures")}: ${stateLabel}`}
		>
			<span
				className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)}
				aria-hidden="true"
			/>
			<span className="text-tiny text-txt-200 font-medium">
				{t("status.b3futures")}
			</span>
			<span className={cn("text-tiny font-semibold", stateColorClass)}>
				{stateLabel}
			</span>
		</div>
	)
}

export { MarketStatusPill }
