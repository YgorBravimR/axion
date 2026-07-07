"use client"

import { cn } from "@/lib/utils"
import { useFormatting } from "@/hooks/use-formatting"

interface WeekRowProps {
	weekIndex: number
	targetR: number | null
	actualR: number | null
	endBalanceCents: number
	isCurrent?: boolean
	isPast?: boolean
}

const formatR = (r: number | null): string =>
	r === null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(1)}R`

const WeekRow = ({
	weekIndex,
	targetR,
	actualR,
	endBalanceCents,
	isCurrent,
	isPast,
}: WeekRowProps) => {
	const { formatCurrency } = useFormatting()
	const formatBRL = (cents: number): string => formatCurrency(cents / 100)

	// Actual rendering: when we have actual data and past, display actual with primary weight;
	// else display target with secondary weight
	const hasActual = isPast && actualR !== null
	const displayValue = hasActual ? actualR : targetR

	// Color tone follows the displayed value (actual or target)
	const tone =
		displayValue === null
			? "text-txt-300"
			: displayValue > 0
				? "text-trade-buy"
				: displayValue < 0
					? "text-trade-sell"
					: "text-txt-200"

	// Visual weight: actual is primary (font-semibold), target is secondary (muted)
	const weight = hasActual ? "font-semibold" : "text-txt-300"
	const finalClass = cn("tabular-nums", tone, weight)

	return (
		<div
			className={cn(
				"gap-x-s-300 py-s-100 text-tiny grid grid-cols-[auto_1fr_auto] items-baseline font-mono",
				isCurrent && "bg-bg-stripe px-s-200 rounded-sm"
			)}
			data-testid={`week-row-${weekIndex}`}
		>
			<span className="text-txt-300 tabular-nums">
				S{String(weekIndex).padStart(2, "0")}
			</span>
			<span className={finalClass}>{formatR(displayValue)}</span>
			<span className="text-txt-200 tabular-nums">
				{formatBRL(endBalanceCents)}
			</span>
		</div>
	)
}

export { WeekRow }
export type { WeekRowProps }
