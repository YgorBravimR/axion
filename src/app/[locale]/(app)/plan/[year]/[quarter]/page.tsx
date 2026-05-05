import { setRequestLocale } from "next-intl/server"
import Link from "next/link"
import { redirect } from "next/navigation"
import { and, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { yearlyPlans, quarterlyPlan } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { PlanBreadcrumb } from "@/components/fractal-plan/breadcrumb"
import { QuarterlyPlanEditor } from "@/components/fractal-plan/quarterly-plan-editor"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string }>
}

const MONTH_NAMES = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

const PlanQuarterPage = async ({ params }: PageProps) => {
	const { locale, year: yearStr, quarter: quarterStr } = await params
	setRequestLocale(locale)
	const year = Number(yearStr)
	const q = Number(quarterStr)
	if (!Number.isInteger(year) || ![1, 2, 3, 4].includes(q)) {
		redirect(`/${locale}/plan/${year}`)
	}

	const { accountId } = await requireAuth()
	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)),
	})
	if (!yearRow) redirect(`/${locale}/plan/${year}`)

	const quarterRow = await db.query.quarterlyPlan.findFirst({
		where: and(eq(quarterlyPlan.yearlyPlanId, yearRow.id), eq(quarterlyPlan.quarter, q)),
	})
	if (!quarterRow) redirect(`/${locale}/plan/${year}`)

	const months = [(q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3]
	const breadcrumb = (
		<PlanBreadcrumb
			segments={[
				{ label: String(year), href: `/${locale}/plan/${year}` },
				{ label: `Q${q}` },
			]}
		/>
	)

	return (
		<div className="space-y-m-500">
			<PlanSection
				title={`Q${q} ${year}`}
				subtitle="Quarterly intent — goal, reflection, post-mortem."
				breadcrumb={breadcrumb}
			>
				<QuarterlyPlanEditor
					quarterlyPlanId={quarterRow.id}
					existing={{
						goalCents: quarterRow.goalCents,
						reflectionNotes: quarterRow.reflectionNotes,
						postMortemNotes: quarterRow.postMortemNotes,
					}}
				/>
			</PlanSection>

			<PlanSection title="Months in this quarter">
				<ul className="grid grid-cols-3 gap-s-300">
					{months.map((m) => (
						<li key={m}>
							<Link
								href={`/${locale}/plan/${year}/${q}/${m}`}
								className="block rounded-lg border border-bg-300 bg-bg-100 px-m-300 py-s-300 text-center transition-colors hover:border-acc-100 hover:text-acc-100"
							>
								<div className="text-sm text-txt-200">Month {m}</div>
								<div className="text-lg font-medium text-txt-100">{MONTH_NAMES[m - 1]}</div>
							</Link>
						</li>
					))}
				</ul>
			</PlanSection>
		</div>
	)
}

export { PlanQuarterPage as default }
