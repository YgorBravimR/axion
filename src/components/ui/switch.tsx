"use client"

import { forwardRef } from "react"
import type { ElementRef, ComponentPropsWithoutRef } from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

const Switch = forwardRef<
	ElementRef<typeof SwitchPrimitives.Root>,
	Omit<ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>, "id"> & {
		id: string
	}
>(({ className, id, ...props }, ref) => (
	<SwitchPrimitives.Root
		id={id}
		className={cn(
			"peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
			"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-100 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-100",
			"disabled:cursor-not-allowed disabled:opacity-50",
			"data-[state=checked]:bg-acc-100 data-[state=unchecked]:bg-bg-300",
			className
		)}
		{...props}
		ref={ref}
	>
		<SwitchPrimitives.Thumb
			className={cn(
				"pointer-events-none block h-5 w-5 rounded-full bg-bg-100 shadow-lg ring-0 transition-transform",
				"data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
			)}
		/>
	</SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
