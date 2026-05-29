"use client"

import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SweepModeToggleProps {
	/** Unique id used by the underlying button for a11y / DOM scoping. */
	"id": string
	/** Whether the parent leaf is currently in sweep mode. */
	"isSweepMode": boolean
	/** Called when the user clicks the toggle. Parent decides the new selection. */
	"onToggle": () => void
	/** Accessible label (e.g. "Sweep BE trigger"). Falls back to "Sweep". */
	"aria-label"?: string
	/** Optional disabled state (used when an owner leaf locks this one). */
	"disabled"?: boolean
	/** Optional custom title attribute (tooltip). */
	"title"?: string
}

const SweepModeToggle = ({
	id,
	isSweepMode,
	onToggle,
	"aria-label": ariaLabel,
	disabled,
	title,
}: SweepModeToggleProps) => {
	return (
		<Button
			id={id}
			type="button"
			variant={isSweepMode ? "secondary" : "ghost"}
			size="sm"
			onClick={onToggle}
			disabled={disabled}
			aria-pressed={isSweepMode}
			aria-label={ariaLabel ?? "Sweep"}
			title={title}
			className={cn(
				"px-s-200 text-tiny h-6",
				isSweepMode
					? "bg-acc-100/15 text-acc-100 hover:bg-acc-100/20"
					: "text-txt-300 hover:text-txt-200"
			)}
		>
			<Sparkles className="h-3 w-3" aria-hidden="true" />
			Sweep
		</Button>
	)
}

export { SweepModeToggle }
