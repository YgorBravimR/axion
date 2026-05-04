import type { ReactNode } from "react"

interface PlanSectionProps {
	title: string
	subtitle?: string
	breadcrumb?: ReactNode
	children: ReactNode
}

const PlanSection = ({ title, subtitle, breadcrumb, children }: PlanSectionProps) => (
	<section className="space-y-m-300">
		{breadcrumb ? <div className="text-sm text-text-200">{breadcrumb}</div> : null}
		<header className="space-y-m-100">
			<h1 className="text-2xl font-medium text-text-100">{title}</h1>
			{subtitle ? <p className="text-text-200">{subtitle}</p> : null}
		</header>
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-m-400">{children}</div>
	</section>
)

export type { PlanSectionProps }
export { PlanSection }
