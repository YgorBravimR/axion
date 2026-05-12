import { setRequestLocale, getTranslations } from "next-intl/server"
import { requireAuth } from "@/app/actions/auth"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { MonthReport } from "@/components/fractal-plan/cockpit/month-report"

interface PageProps {
	params: Promise<{
		locale: string
		year: string
		quarter: string
		month: string
	}>
}

const PlanMonthPage = async ({ params }: PageProps) => {
	const {
		locale,
		year: yearStr,
		quarter: quarterStr,
		month: monthStr,
	} = await params
	setRequestLocale(locale)
	const t = await getTranslations({ locale, namespace: "plan" })

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
			<PlanSection title={t("errors.invalidMonth")}>
				<p className="text-txt-200">{t("errors.invalidMonthBody")}</p>
			</PlanSection>
		)
	}

	const expectedQuarter = Math.ceil(month / 3)
	if (quarter !== expectedQuarter) {
		return (
			<PlanSection title={t("errors.invalidMonth")}>
				<p className="text-txt-200">
					{t("errors.invalidMonthQuarterMismatch", {
						month,
						quarter: expectedQuarter,
						actualQuarter: quarter,
					})}
				</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()

	return (
		<MonthReport
			accountId={accountId}
			year={year}
			quarter={quarter}
			month={month}
			locale={locale}
		/>
	)
}

export { PlanMonthPage as default }
