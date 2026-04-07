"use client"

import { forwardRef } from "react"
import type { ElementRef, ComponentPropsWithoutRef } from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CheckboxProps extends ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
	id: string
}

const Checkbox = forwardRef<
	ElementRef<typeof CheckboxPrimitive.Root>,
	CheckboxProps
>(({ className, ...props }, ref) => (
	<CheckboxPrimitive.Root
		ref={ref}
		className={cn(
			"peer h-4 w-4 shrink-0 rounded-sm border border-bg-400 ring-offset-bg-100",
			"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-100 focus-visible:ring-offset-2",
			"disabled:cursor-not-allowed disabled:opacity-50",
			"data-[state=checked]:bg-acc-100 data-[state=checked]:border-acc-100 data-[state=checked]:text-bg-100",
			className
		)}
		{...props}
	>
		<CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
			<Check className="h-3 w-3" />
		</CheckboxPrimitive.Indicator>
	</CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
