"use client"

import { ToggleLeft, ToggleRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface ToggleStateIconProps {
	isActive: boolean
	className?: string
}

const ToggleStateIcon = ({ isActive, className }: ToggleStateIconProps) => {
	return isActive ? (
		<ToggleRight
			className={cn("text-fb-success h-4 w-4", className)}
			aria-hidden="true"
		/>
	) : (
		<ToggleLeft
			className={cn("text-txt-300 h-4 w-4", className)}
			aria-hidden="true"
		/>
	)
}

export { ToggleStateIcon }
