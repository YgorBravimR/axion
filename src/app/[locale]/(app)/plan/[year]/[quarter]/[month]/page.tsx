import { setRequestLocale } from "next-intl/server"
import { requireAuth } from "@/app/actions/auth"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { MonthlyPlanTabContent } from "@/components/monthly-plan/monthly-plan-tab-content"

interface PageProps {
	params: Promise<{
		locale: string
		year: string
		quarter: string
		month: string
	}>
}

const PlanMonthPage = async ({ params }: PageProps) => {
	const { locale, year: yearStr, quarter: quarterStr, month: monthStr } =
		await params
	setRequestLocale(locale)

	const year = Number(yearStr)
	const quarter = Number(quarterStr)
	const month = Number(monthStr)

	if (
		!Number.isInteger(year) ||
		!Number.isInteger(quarter) ||
		!Number.isInteger(month) ||
		month < 1 ||
		month > 12 ||
		quarter < 1 ||
		quarter > 4
	) {
		return (
			<PlanSection title="Invalid month">
				<p className="text-txt-200">
					Year/quarter/month must be valid integers.
				</p>
			</PlanSection>
		)
	}

	const expectedQuarter = Math.ceil(month / 3)
	if (quarter !== expectedQuarter) {
		return (
			<PlanSection title="Invalid month">
				<p className="text-txt-200">
					Month {month} belongs to Q{expectedQuarter}, not Q{quarter}.
				</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()

	return (
		<MonthlyPlanTabContent
			accountId={accountId}
			year={year}
			month={month}
			locale={locale}
		/>
	)
}

export { PlanMonthPage as default }
