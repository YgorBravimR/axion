import { setRequestLocale } from "next-intl/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { yearlyPlans } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { resolveYear } from "@/lib/fractal-plan/resolver"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { ProvenanceBadge } from "@/components/fractal-plan/provenance-badge"
import { YearlyPlanEditor } from "@/components/fractal-plan/yearly-plan-editor"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

interface PageProps {
	params: Promise<{ locale: string; year: string }>
}

const formatR = (n: number | null): string => (n == null ? "—" : `${n.toFixed(2)}R`)

const PlanYearPage = async ({ params }: PageProps) => {
	const { locale, year: yearStr } = await params
	setRequestLocale(locale)
	const year = Number(yearStr)
	if (!Number.isInteger(year) || year < 2000 || year > 2100) {
		return (
			<PlanSection title="Invalid year">
				<p className="text-txt-200">Year must be a 4-digit integer between 2000 and 2100.</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()

	const [resolved, row] = await Promise.all([
		resolveYear({ accountId, year }),
		db.query.yearlyPlans.findFirst({
			where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)),
		}),
	])

	const existing = row
		? {
			initialCapitalCents: row.initialCapitalCents,
			ladderRules: row.ladderRules as unknown as LadderRuleR[],
			tradingDaysPerWeek: row.tradingDaysPerWeek,
			defaultDailyLossR: row.defaultDailyLossR,
			defaultDailyWinR: row.defaultDailyWinR,
			defaultWeeklyLossR: row.defaultWeeklyLossR,
			defaultWeeklyWinR: row.defaultWeeklyWinR,
			defaultMonthlyLossR: row.defaultMonthlyLossR,
			defaultMonthlyWinR: row.defaultMonthlyWinR,
			notes: row.notes,
		}
		: null

	return (
		<div className="space-y-m-500">
			<PlanSection
				title={`Plan ${year}`}
				subtitle="Year-level defaults — propagate down to quarter, month, week, day"
			>
				{existing ? (
					<dl className="grid grid-cols-1 gap-s-300 sm:grid-cols-2">
						<div>
							<dt className="text-sm text-txt-200">Default daily loss R</dt>
							<dd className="mt-1 flex items-center gap-s-200">
								<span className="font-mono text-lg text-txt-100">
									{formatR(resolved.defaultDailyLossR)}
								</span>
								<ProvenanceBadge level={resolved.defaultDailyLossR_provenance} />
							</dd>
						</div>
						<div>
							<dt className="text-sm text-txt-200">Default daily win R</dt>
							<dd className="mt-1 flex items-center gap-s-200">
								<span className="font-mono text-lg text-txt-100">
									{formatR(resolved.defaultDailyWinR)}
								</span>
								<ProvenanceBadge level={resolved.defaultDailyWinR_provenance} />
							</dd>
						</div>
						<div>
							<dt className="text-sm text-txt-200">Default weekly loss / win R</dt>
							<dd className="mt-1 flex items-center gap-s-200">
								<span className="font-mono text-lg text-txt-100">
									{formatR(resolved.defaultWeeklyLossR)} / {formatR(resolved.defaultWeeklyWinR)}
								</span>
								<ProvenanceBadge level={resolved.defaultWeeklyWinR_provenance} />
							</dd>
						</div>
						<div>
							<dt className="text-sm text-txt-200">Default monthly loss / win R</dt>
							<dd className="mt-1 flex items-center gap-s-200">
								<span className="font-mono text-lg text-txt-100">
									{formatR(resolved.defaultMonthlyLossR)} / {formatR(resolved.defaultMonthlyWinR)}
								</span>
								<ProvenanceBadge level={resolved.defaultMonthlyWinR_provenance} />
							</dd>
						</div>
					</dl>
				) : (
					<p className="text-txt-200">
						No yearly plan for {year}. Fill the form below to seed defaults + the
						quarter/month/week tree.
					</p>
				)}
			</PlanSection>

			<PlanSection
				title={existing ? "Edit yearly defaults" : "Seed yearly plan"}
				subtitle="Sets year-level R-multiples, capital ladder, and trading-days context."
			>
				<YearlyPlanEditor year={year} existing={existing} />
			</PlanSection>
		</div>
	)
}

export { PlanYearPage as default }
