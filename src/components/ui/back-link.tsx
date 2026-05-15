import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

interface BackLinkProps {
	href: string
	children: ReactNode
	className?: string
}

const BackLink = ({ href, children, className }: BackLinkProps) => (
	<Link
		href={href}
		className={cn(
			"text-txt-300 hover:text-txt-200 gap-s-200 flex items-center font-medium",
			className
		)}
	>
		<ArrowLeft className="h-4 w-4" aria-hidden="true" />
		{children}
	</Link>
)

export { BackLink }
