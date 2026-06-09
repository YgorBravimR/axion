"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { useFormatting } from "@/hooks/use-formatting"

interface DailyRiskGaugeProps {
	/** Today's net P&L in BRL (signed, NOT cents). */
	dailyPnL: number
	/** Daily loss limit in BRL (positive number, may be null when not configured). */
	lossLimit: number | null
	/** Daily profit target in BRL (positive number, may be null when not configured). */
	profitTarget: number | null
}

/**
 * Horizontal gauge visualizing today's P&L against the configured daily
 * risk band. Topstep / Apex-style "where am I on the budget" glance.
 *
 *   ┌──────────────────────────────────────────┐
 *   │ loss zone        ▲          profit zone   │
 *   │ −LIMIT           0           +TARGET      │
 *   └──────────────────────────────────────────┘
 *
 * The fill grows from 0 outward in the direction of current P&L. When the
 * loss limit or profit target is unconfigured the gauge degrades to an
 * absolute scale anchored on whichever boundary is set.
 */
const DailyRiskGauge = ({
	dailyPnL,
	lossLimit,
	profitTarget,
}: DailyRiskGaugeProps) => {
	const t = useTranslations("commandCenter.dailyRiskGauge")
	const { formatCompactCurrencyWithSign } = useFormatting()

	// Bail when there's no risk band at all — without bounds the visualization
	// is meaningless and the existing numeric panel covers the case.
	if ((lossLimit ?? 0) <= 0 && (profitTarget ?? 0) <= 0) {
		return null
	}

	// Anchor: when only one side is configured, mirror it so the zero line
	// always sits at the center. That keeps the visual stable across days
	// when the trader has set one boundary but not the other.
	const leftMax = Math.max(lossLimit ?? profitTarget ?? 1, 1)
	const rightMax = Math.max(profitTarget ?? lossLimit ?? 1, 1)

	const isProfit = dailyPnL >= 0
	const clampedPct = isProfit
		? Math.min((dailyPnL / rightMax) * 50, 50)
		: Math.min((Math.abs(dailyPnL) / leftMax) * 50, 50)

	// Fill bar starts at the centerline (50%) and grows outward.
	const fillLeft = isProfit ? 50 : 50 - clampedPct
	const fillWidth = clampedPct

	const fillClass = isProfit
		? clampedPct >= 40
			? "bg-trade-buy"
			: "bg-trade-buy/70"
		: clampedPct >= 40
			? "bg-trade-sell"
			: "bg-trade-sell/70"

	const stateLabel = isProfit
		? clampedPct >= 50
			? t("targetHit")
			: clampedPct >= 40
				? t("nearTarget")
				: t("inProfit")
		: clampedPct >= 50
			? t("limitHit")
			: clampedPct >= 40
				? t("nearLimit")
				: t("inLoss")

	const stateClass = isProfit
		? clampedPct >= 40
			? "text-trade-buy"
			: "text-trade-buy/80"
		: clampedPct >= 40
			? "text-trade-sell"
			: "text-warning"

	return (
		<div
			id="cc-daily-risk-gauge"
			className="mb-s-300 sm:mb-m-400"
			role="meter"
			aria-label={t("ariaLabel")}
			aria-valuemin={-leftMax}
			aria-valuemax={rightMax}
			aria-valuenow={dailyPnL}
			aria-valuetext={`${formatCompactCurrencyWithSign(dailyPnL)} · ${stateLabel}`}
		>
			<div className="mb-s-100 flex items-center justify-between">
				<span className="text-tiny text-txt-300 font-medium tracking-wide uppercase">
					{t("title")}
				</span>
				<span className={cn("text-tiny font-semibold", stateClass)}>
					{stateLabel}
				</span>
			</div>

			{/* Track with red (left) + green (right) ghost zones */}
			<div className="relative h-2.5 w-full overflow-hidden rounded-full">
				<div className="bg-trade-sell/10 absolute inset-y-0 left-0 w-1/2" />
				<div className="bg-trade-buy/10 absolute inset-y-0 right-0 w-1/2" />
				{/* Live fill, anchored on the zero line */}
				<div
					className={cn("absolute inset-y-0 transition-all", fillClass)}
					style={{
						left: `${fillLeft}%`,
						width: `${fillWidth}%`,
					}}
				/>
				{/* Zero-line marker */}
				<div
					className="bg-txt-100 absolute inset-y-0 left-1/2 w-px"
					aria-hidden="true"
				/>
			</div>

			{/* Boundary labels */}
			<div className="mt-s-100 text-micro text-txt-300 flex justify-between tabular-nums">
				<span>
					{(lossLimit ?? 0) > 0
						? `-${formatCompactCurrencyWithSign(lossLimit!).replace(/^[+-]/, "")}`
						: "—"}
				</span>
				<span className="text-txt-200">
					{formatCompactCurrencyWithSign(dailyPnL)}
				</span>
				<span>
					{(profitTarget ?? 0) > 0
						? `+${formatCompactCurrencyWithSign(profitTarget!).replace(/^[+-]/, "")}`
						: "—"}
				</span>
			</div>
		</div>
	)
}

export { DailyRiskGauge }
