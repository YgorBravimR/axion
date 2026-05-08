"use client"

import type { ComponentProps } from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "@/lib/utils"
import { RequiredIndicator } from "@/components/ui/required-indicator"

interface LabelProps extends ComponentProps<typeof LabelPrimitive.Root> {
	id: string
	/** Whether this field is required (shows * indicator) */
	required?: boolean
	/** Whether the field has a value (controls * color: green when filled, red when empty) */
	filled?: boolean
}

const Label = ({
	className,
	children,
	required,
	filled = false,
	...props
}: LabelProps) => {
	return (
		<LabelPrimitive.Root
			data-slot="label"
			className={cn(
				"gap-s-200 text-small text-txt-200 flex items-center leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
				className
			)}
			{...props}
		>
			{children}
			{required && <RequiredIndicator filled={filled} />}
		</LabelPrimitive.Root>
	)
}

export { Label }
export type { LabelProps }
