import { cn } from "@/lib/utils"

interface WeekRowProps {
	weekIndex: number
	targetR: number | null
	actualR: number | null
	endBalanceCents: number
	isCurrent?: boolean
	isPast?: boolean
}

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

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
	const display = isPast && actualR !== null ? actualR : targetR
	const tone =
		display === null
			? "text-txt-300"
			: display > 0
				? "text-profit"
				: display < 0
					? "text-loss"
					: "text-txt-200"

	return (
		<div
			className={cn(
				"gap-x-s-300 py-s-100 grid grid-cols-[auto_1fr_auto] items-baseline font-mono text-xs",
				isCurrent && "bg-bg-stripe px-s-200 rounded-sm"
			)}
			data-testid={`week-row-${weekIndex}`}
		>
			<span className="text-txt-300 tabular-nums">
				S{String(weekIndex).padStart(2, "0")}
			</span>
			<span className={cn("tabular-nums", tone)}>{formatR(display)}</span>
			<span className="text-txt-200 tabular-nums">
				{formatBRL(endBalanceCents)}
			</span>
		</div>
	)
}

export { WeekRow }
export type { WeekRowProps }
