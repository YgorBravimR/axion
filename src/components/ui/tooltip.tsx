"use client"

import type { ComponentProps } from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = ({
	delayDuration = 0,
	...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) => {
	return (
		<TooltipPrimitive.Provider
			data-slot="tooltip-provider"
			delayDuration={delayDuration}
			{...props}
		/>
	)
}

const Tooltip = ({
	...props
}: ComponentProps<typeof TooltipPrimitive.Root>) => {
	return (
		<TooltipProvider>
			<TooltipPrimitive.Root data-slot="tooltip" {...props} />
		</TooltipProvider>
	)
}

const TooltipTrigger = ({
	...props
}: ComponentProps<typeof TooltipPrimitive.Trigger>) => {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

interface TooltipContentProps extends ComponentProps<typeof TooltipPrimitive.Content> {
	id: string
}

const TooltipContent = ({
	className,
	sideOffset = 8,
	children,
	...props
}: TooltipContentProps) => {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				data-slot="tooltip-content"
				sideOffset={sideOffset}
				className={cn(
					"bg-bg-100 border-bg-300 text-txt-100 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md border p-s-200 text-tiny shadow-medium",
					className
				)}
				{...props}
			>
				<TooltipPrimitive.Arrow className="bg-bg-100 fill-bg-100 translate-y-[calc(-50%_-_2px)] z-50 size-2.5 rotate-45 rounded-[2px]" />
				{children}
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	)
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
