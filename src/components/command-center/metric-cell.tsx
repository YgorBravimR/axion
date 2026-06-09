import { memo } from "react"

import { cn } from "@/lib/utils"

export interface MetricCellProps {
	label: string
	value: string
	subLabel?: string
	valueClassName?: string
}

export const MetricCell = memo(
	({
		label,
		value,
		subLabel,
		valueClassName = "text-txt-100",
	}: MetricCellProps) => (
		<dl className="space-y-s-100 min-w-0">
			<dt className="text-tiny text-txt-300 truncate">{label}</dt>
			<dd
				className={cn(
					"text-body block min-w-0 truncate font-semibold",
					valueClassName
				)}
			>
				{value}
			</dd>
			{subLabel && (
				<dd className="text-tiny text-txt-300 truncate">{subLabel}</dd>
			)}
		</dl>
	)
)
MetricCell.displayName = "CommandCenterMetricCell"
