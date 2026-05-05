import Link from "next/link"
import { ChevronRight } from "lucide-react"

interface BreadcrumbSegment {
	label: string
	href?: string
}

interface PlanBreadcrumbProps {
	segments: BreadcrumbSegment[]
}

const PlanBreadcrumb = ({ segments }: PlanBreadcrumbProps) => (
	<nav aria-label="Plan breadcrumb" className="flex flex-wrap items-center gap-s-100 text-sm">
		{segments.map((segment, index) => {
			const isLast = index === segments.length - 1
			return (
				<div key={`${segment.label}-${index}`} className="flex items-center gap-s-100">
					{segment.href && !isLast ? (
						<Link href={segment.href} className="text-txt-200 hover:text-acc-100 transition-colors">
							{segment.label}
						</Link>
					) : (
						<span className={isLast ? "text-txt-100 font-medium" : "text-txt-200"}>
							{segment.label}
						</span>
					)}
					{!isLast && <ChevronRight className="h-3.5 w-3.5 text-txt-300" />}
				</div>
			)
		})}
	</nav>
)

export type { BreadcrumbSegment, PlanBreadcrumbProps }
export { PlanBreadcrumb }
