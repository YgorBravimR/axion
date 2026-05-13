import type { ComponentProps } from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface FeatureStampProps extends Omit<ComponentProps<"div">, "children"> {
	icon: LucideIcon
	iconClassName?: string
}

const FeatureStamp = ({
	icon: Icon,
	className,
	iconClassName,
	...props
}: FeatureStampProps) => (
	<div
		data-slot="feature-stamp"
		aria-hidden="true"
		className={cn("bg-bg-300 text-acc-100 p-s-200 rounded-md", className)}
		{...props}
	>
		<Icon className={cn("h-5 w-5", iconClassName)} />
	</div>
)

export { FeatureStamp, type FeatureStampProps }
