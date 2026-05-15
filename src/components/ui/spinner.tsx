import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SpinnerProps {
	className?: string
	size?: "sm" | "md" | "lg"
}

const sizeClasses = {
	sm: "h-3 w-3",
	md: "h-4 w-4",
	lg: "h-5 w-5",
}

const Spinner = ({ className, size = "md" }: SpinnerProps) => (
	<Loader2
		className={cn(
			sizeClasses[size],
			"animate-spin motion-reduce:animate-none",
			className
		)}
		aria-hidden="true"
	/>
)

export { Spinner }
