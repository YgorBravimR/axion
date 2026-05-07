import { setRequestLocale } from "next-intl/server"
import { requireAuth } from "@/app/actions/auth"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { QuarterReport } from "@/components/fractal-plan/cockpit/quarter-report"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string }>
}

const PlanQuarterPage = async ({ params }: PageProps) => {
	const { locale, year: yearStr, quarter: quarterStr } = await params
	setRequestLocale(locale)
	const year = Number(yearStr)
	const quarter = Number(quarterStr)

	if (!Number.isInteger(year) || ![1, 2, 3, 4].includes(quarter)) {
		return (
			<PlanSection title="Invalid quarter">
				<p className="text-txt-200">Year/quarter must be valid integers (Q1–Q4).</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()

	return (
		<QuarterReport
			accountId={accountId}
			year={year}
			quarter={quarter}
			locale={locale}
		/>
	)
}

export { PlanQuarterPage as default }
