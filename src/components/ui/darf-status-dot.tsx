import { cn } from "@/lib/utils"

type DarfStatus =
	| "pending"
	| "paid"
	| "exempt"
	| "overdue"
	| "unknown"
	| "in_progress"
	| "future"

interface DarfStatusDotProps {
	status: DarfStatus
	className?: string
}

const STATUS_COLOR: Record<DarfStatus, string> = {
	paid: "bg-fb-success",
	pending: "bg-warning",
	overdue: "bg-fb-error",
	exempt: "bg-txt-300",
	unknown: "bg-bg-300",
	in_progress: "bg-action-buy",
	future: "bg-bg-400",
}

const DarfStatusDot = ({ status, className }: DarfStatusDotProps) => (
	<span
		className={cn("size-2 rounded-full", STATUS_COLOR[status], className)}
		aria-hidden="true"
	/>
)

export { DarfStatusDot }
export type { DarfStatusDotProps, DarfStatus }
