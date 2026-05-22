"use client"

import { useCallback, useRef, type KeyboardEvent, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SegmentedOption<T extends string> {
	value: T
	label: ReactNode
}

interface SegmentedToggleProps<T extends string> {
	// `null | undefined` is the unset state: no option is active. The first
	// button stays tabbable so the control remains keyboard-reachable.
	"value": T | null | undefined
	"options": SegmentedOption<T>[]
	"onChange": (_next: T) => void
	"disabled"?: boolean
	"aria-label"?: string
	"aria-labelledby"?: string
	"className"?: string
}

const SegmentedToggle = <T extends string>({
	value,
	options,
	onChange,
	disabled,
	"aria-label": ariaLabel,
	"aria-labelledby": ariaLabelledby,
	className,
}: SegmentedToggleProps<T>) => {
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([])

	// Arrow-key roving navigation completes the WAI-ARIA radiogroup pattern that
	// the existing tabIndex={isActive ? 0 : -1} only half-implemented. Left/Up
	// move to the previous option, Right/Down to the next, with wrap. Home/End
	// jump to the ends.
	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>, index: number) => {
			if (disabled) {
				return
			}
			const resolveNext = (): number | null => {
				switch (event.key) {
					case "ArrowRight":
					case "ArrowDown":
						return (index + 1) % options.length
					case "ArrowLeft":
					case "ArrowUp":
						return (index - 1 + options.length) % options.length
					case "Home":
						return 0
					case "End":
						return options.length - 1
					default:
						return null
				}
			}
			const nextIndex = resolveNext()
			if (nextIndex === null) {
				return
			}
			event.preventDefault()
			const next = options[nextIndex]
			if (!next) {
				return
			}
			onChange(next.value)
			buttonsRef.current[nextIndex]?.focus()
		},
		[disabled, onChange, options]
	)

	// When no option matches `value` (an unset / sentinel state), the ARIA
	// radiogroup pattern says the first radio is tabbable so the control stays
	// in the keyboard tab order.
	const hasActive = options.some((option) => option.value === value)

	return (
		<div
			className={cn(
				"border-bg-300 bg-bg-100 p-s-100 flex rounded-lg border",
				className
			)}
			role="radiogroup"
			aria-label={ariaLabel}
			aria-labelledby={ariaLabelledby}
		>
			{options.map((option, index) => {
				const isActive = value === option.value
				const isTabbable = hasActive ? isActive : index === 0
				return (
					<button
						key={option.value}
						ref={(node) => {
							buttonsRef.current[index] = node
						}}
						type="button"
						role="radio"
						aria-checked={isActive}
						tabIndex={isTabbable ? 0 : -1}
						onClick={() => onChange(option.value)}
						onKeyDown={(event) => handleKeyDown(event, index)}
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
}

export { SegmentedToggle, type SegmentedToggleProps, type SegmentedOption }
