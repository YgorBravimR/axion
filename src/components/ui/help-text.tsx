import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

interface HelpTextProps extends ComponentProps<"p"> {
	id: string
}

const HelpText = ({ id, className, children, ...props }: HelpTextProps) => (
	<p
		id={id}
		data-slot="help-text"
		className={cn("text-tiny text-txt-300", className)}
		{...props}
	>
		{children}
	</p>
)

export { HelpText, type HelpTextProps }
