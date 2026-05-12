"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SegmentedOption<T extends string> {
	value: T
	label: ReactNode
}

interface SegmentedToggleProps<T extends string> {
	"value": T
	"options": SegmentedOption<T>[]
	"onChange": (_next: T) => void
	"disabled"?: boolean
	"aria-label"?: string
	"className"?: string
}

const SegmentedToggle = <T extends string>({
	value,
	options,
	onChange,
	disabled,
	"aria-label": ariaLabel,
	className,
}: SegmentedToggleProps<T>) => (
	<div
		className={cn(
			"border-bg-300 bg-bg-100 p-s-100 flex rounded-lg border",
			className
		)}
		role="radiogroup"
		aria-label={ariaLabel}
	>
		{options.map((option) => {
			const isActive = value === option.value
			return (
				<button
					key={option.value}
					type="button"
					role="radio"
					aria-checked={isActive}
					tabIndex={isActive ? 0 : -1}
					onClick={() => onChange(option.value)}
					disabled={disabled}
					className={cn(
						"px-s-300 py-s-200 text-tiny sm:text-small min-h-11 rounded-md font-medium transition-colors",
						"focus-visible:outline-acc-100 focus-visible:outline-1 focus-visible:outline-offset-1",
						isActive
							? "bg-bg-300 text-txt-100"
							: "text-txt-300 hover:text-txt-100",
						disabled && "cursor-not-allowed opacity-50"
					)}
				>
					{option.label}
				</button>
			)
		})}
	</div>
)

export { SegmentedToggle, type SegmentedToggleProps, type SegmentedOption }
