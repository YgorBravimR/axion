import type { ComponentProps } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const panelVariants = cva("border-bg-300 rounded-lg border min-w-0", {
	variants: {
		padding: {
			sm: "p-s-300",
			md: "p-s-300 sm:p-m-400",
			lg: "p-s-300 sm:p-m-400 lg:p-m-500",
			none: "",
		},
		tone: {
			default: "bg-bg-200",
			muted: "bg-bg-100 border-dashed",
		},
	},
	defaultVariants: {
		padding: "lg",
		tone: "default",
	},
})

type PanelProps = ComponentProps<"div"> & VariantProps<typeof panelVariants>

const Panel = ({ className, padding, tone, ...props }: PanelProps) => (
	<div
		data-slot="panel"
		className={cn(panelVariants({ padding, tone }), className)}
		{...props}
	/>
)

export { Panel, panelVariants, type PanelProps }
