import Link from "next/link"
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

interface BreadcrumbSegment {
	label: string
	href?: string
}

interface PlanBreadcrumbProps {
	segments: BreadcrumbSegment[]
}

const PlanBreadcrumb = ({ segments }: PlanBreadcrumbProps) => (
	<Breadcrumb aria-label="Plan breadcrumb">
		<BreadcrumbList>
			{segments.map((segment, index) => {
				const isLast = index === segments.length - 1
				return (
					<div key={`${segment.label}-${index}`} className="contents">
						<BreadcrumbItem>
							{segment.href && !isLast ? (
								<BreadcrumbLink asChild>
									<Link href={segment.href}>{segment.label}</Link>
								</BreadcrumbLink>
							) : (
								<BreadcrumbPage>{segment.label}</BreadcrumbPage>
							)}
						</BreadcrumbItem>
						{!isLast && <BreadcrumbSeparator />}
					</div>
				)
			})}
		</BreadcrumbList>
	</Breadcrumb>
)

export type { BreadcrumbSegment, PlanBreadcrumbProps }
export { PlanBreadcrumb }
