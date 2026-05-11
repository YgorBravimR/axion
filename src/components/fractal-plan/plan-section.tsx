import type { ReactNode } from "react"

interface PlanSectionProps {
	title: string
	subtitle?: string
	breadcrumb?: ReactNode
	children: ReactNode
}

const PlanSection = ({
	title,
	subtitle,
	breadcrumb,
	children,
}: PlanSectionProps) => (
	<section className="space-y-s-300">
		{breadcrumb ? (
			<div className="text-small text-txt-200">{breadcrumb}</div>
		) : null}
		<header className="space-y-s-100">
			<h1 className="text-txt-100 text-2xl font-medium">{title}</h1>
			{subtitle ? <p className="text-txt-200">{subtitle}</p> : null}
		</header>
		<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
			{children}
		</div>
	</section>
)

export type { PlanSectionProps }
export { PlanSection }
