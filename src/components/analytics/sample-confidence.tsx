"use client"

import { useTranslations } from "next-intl"
import { AlertTriangle, Info } from "lucide-react"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
	SAMPLE_THRESHOLDS,
	classifySample,
	wilsonInterval,
} from "@/lib/statistics"

/**
 * Shared sample-confidence chrome for analytics widgets.
 *
 * Centralizes the "this number is from N trades" warning so every chart
 * speaks the same language: gray below MIN_VISIBLE, "low confidence"
 * badge below MIN_RELIABLE, win-rate Wilson CI on demand.
 *
 * Use SampleBadge inline next to a metric (e.g. in a "best session" card)
 * to flag low-n claims. Use InsufficientDataNote for the empty-state of a
 * "best/worst" widget when there isn't enough data anywhere.
 */

interface SampleBadgeProps {
	n: number
	/** Optional class to size/space inside the host. */
	className?: string
	/** Show "n trades" inside the badge text. Defaults to true. */
	showCount?: boolean
}

const SampleBadge = ({ n, className, showCount = true }: SampleBadgeProps) => {
	const t = useTranslations("analytics.time")
	const confidence = classifySample(n)
	if (confidence === "reliable") {
		return null
	}
	// Preserve the "insufficient" label even when showCount is false — otherwise
	// a 1-trade cell would silently downgrade to the milder "Low confidence"
	// text and lose its visual urgency.
	const text =
		confidence === "insufficient"
			? t("insufficientDataShort")
			: showCount
				? t("lowConfidenceCell", { n })
				: t("lowConfidence")
	return (
		<Tooltip>
			{/* `asChild` + a button keeps the trigger keyboard-focusable so screen
			   reader / keyboard users can open the explanation. A span swallowed
			   focus and tab-order before. */}
			<TooltipTrigger asChild>
				<button
					type="button"
					className={cn(
						"gap-s-100 text-tiny inline-flex cursor-help items-center border-0 bg-transparent p-0",
						confidence === "insufficient" ? "text-warning" : "text-txt-300",
						className
					)}
				>
					<AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
					<span>{text}</span>
				</button>
			</TooltipTrigger>
			<TooltipContent
				id="tooltip-sample-confidence"
				side="top"
				className="border-bg-300 bg-bg-100 text-txt-200 p-s-300 max-w-xs border shadow-lg"
			>
				{t("insufficientSlot", { min: SAMPLE_THRESHOLDS.MIN_FOR_RANKING })}
			</TooltipContent>
		</Tooltip>
	)
}

interface InsufficientDataNoteProps {
	className?: string
}

/** Inline block shown when a ranking widget can't rank anything. */
const InsufficientDataNote = ({ className }: InsufficientDataNoteProps) => {
	const t = useTranslations("analytics.time")
	return (
		<div
			className={cn(
				"border-bg-300 bg-bg-100 p-s-300 sm:p-m-400 gap-s-200 flex items-start rounded-lg border",
				className
			)}
		>
			<AlertTriangle
				className="text-warning mt-s-100 h-4 w-4 shrink-0"
				aria-hidden="true"
			/>
			<div className="text-tiny text-txt-200">
				<p className="text-txt-100 font-medium">{t("insufficientData")}</p>
				<p className="mt-s-100 text-txt-300">
					{t("insufficientSlot", { min: SAMPLE_THRESHOLDS.MIN_FOR_RANKING })}
				</p>
			</div>
		</div>
	)
}

interface WinRateCiProps {
	wins: number
	losses: number
	className?: string
}

/**
 * Render the 95% Wilson CI for a win rate as "X–Y%" with an info icon.
 * Used in tooltips/sub-text next to a win-rate display so the user sees
 * how tight the band is, not just the point estimate.
 */
const WinRateCi = ({ wins, losses, className }: WinRateCiProps) => {
	const t = useTranslations("analytics.time")
	const decided = wins + losses
	if (decided === 0) {
		return null
	}
	const [lo, hi] = wilsonInterval(wins, decided)
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className={cn(
						"gap-s-100 text-tiny text-txt-300 inline-flex cursor-help items-center border-0 bg-transparent p-0",
						className
					)}
				>
					<Info className="h-3 w-3" aria-hidden="true" />
					<span>
						{t("ciLabel")} {(lo * 100).toFixed(0)}–{(hi * 100).toFixed(0)}%
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent
				id="tooltip-winrate-ci"
				side="top"
				className="border-bg-300 bg-bg-100 text-txt-200 p-s-300 max-w-xs border shadow-lg"
			>
				{t("insufficientSlot", { min: SAMPLE_THRESHOLDS.MIN_FOR_RANKING })}
			</TooltipContent>
		</Tooltip>
	)
}

export { SampleBadge, InsufficientDataNote, WinRateCi }
