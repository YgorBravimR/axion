"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PluginOption {
	value: string
	label: string
	description?: string
	icon?: ReactNode
}

interface PluginPickerProps {
	options: PluginOption[]
	selected: string
	onSelect: (value: string) => void
}

/**
 * Selectable card-based picker for module types.
 * Selected card gets accent border + bg. Unselected are dimmed.
 */
const PluginPicker = ({ options, selected, onSelect }: PluginPickerProps) => {
	return (
		<div className="gap-s-300 flex flex-wrap">
			{options.map((option) => {
				const isSelected = option.value === selected
				return (
					<button
						key={option.value}
						type="button"
						onClick={() => onSelect(option.value)}
						className={cn(
							"rounded-lg border px-m-400 py-s-300 text-left transition-colors",
							"focus-visible:ring-acc-100 focus-visible:outline-none focus-visible:ring-2",
							isSelected
								? "border-acc-100/50 bg-acc-100/5 text-txt-100"
								: "border-bg-300 bg-bg-100/50 text-txt-300 hover:border-bg-400 hover:text-txt-200"
						)}
						aria-pressed={isSelected}
						tabIndex={0}
					>
						<div className="flex items-center gap-s-200">
							{option.icon && <span className="text-small">{option.icon}</span>}
							<span className="text-small font-medium">{option.label}</span>
						</div>
						{option.description && (
							<p className="text-tiny text-txt-300 mt-s-100">{option.description}</p>
						)}
					</button>
				)
			})}
		</div>
	)
}

interface TogglePluginProps {
	label: string
	description?: string
	enabled: boolean
	onToggle: (enabled: boolean) => void
	children?: ReactNode
}

/**
 * Toggle-able plugin block. When enabled, expands to show config inputs.
 */
const TogglePlugin = ({ label, description, enabled, onToggle, children }: TogglePluginProps) => {
	return (
		<div
			className={cn(
				"rounded-lg border px-m-400 py-s-300 transition-colors",
				enabled
					? "border-acc-100/30 bg-acc-100/5"
					: "border-bg-300 bg-bg-100/50"
			)}
		>
			<button
				type="button"
				onClick={() => onToggle(!enabled)}
				className="flex w-full items-center justify-between gap-m-400 text-left"
				aria-pressed={enabled}
				tabIndex={0}
			>
				<div>
					<span className={cn("text-small font-medium", enabled ? "text-txt-100" : "text-txt-300")}>
						{label}
					</span>
					{description && (
						<p className="text-tiny text-txt-300 mt-s-100">{description}</p>
					)}
				</div>
				<div
					className={cn(
						"h-4 w-4 shrink-0 rounded-full border-2 transition-colors",
						enabled ? "border-acc-100 bg-acc-100" : "border-bg-400"
					)}
				/>
			</button>
			{enabled && children && (
				<div className="mt-m-400 border-bg-300 border-t pt-m-400">
					{children}
				</div>
			)}
		</div>
	)
}

export { PluginPicker, TogglePlugin, type PluginOption }
