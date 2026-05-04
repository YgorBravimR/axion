import { setRequestLocale } from "next-intl/server"
import { requireAuth } from "@/app/actions/auth"
import { resolveMonth } from "@/lib/fractal-plan/resolver"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { ProvenanceBadge } from "@/components/fractal-plan/provenance-badge"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string; month: string }>
}

const formatR = (n: number | null): string => (n == null ? "—" : `${n.toFixed(2)}R`)
const MONTH_NAME = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const PlanMonthPage = async ({ params }: PageProps) => {
	const { locale, year: yearStr, month: monthStr } = await params
	setRequestLocale(locale)
	const year = Number(yearStr)
	const month = Number(monthStr)
	if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
		return (
			<PlanSection title="Invalid month">
				<p className="text-text-200">Month must be 1-12.</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()
	const r = await resolveMonth({ accountId, year, month })

	return (
		<PlanSection
			title={`${MONTH_NAME[month]} ${year}`}
			subtitle="Month-level cascade-resolved targets"
			breadcrumb={<a href={`/${locale}/plan/${year}`} className="hover:text-text-100">{year}</a>}
		>
			<dl className="grid grid-cols-1 gap-m-300 sm:grid-cols-2">
				<div>
					<dt className="text-sm text-text-200">Monthly win R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.monthlyWinR)}</span>
						<ProvenanceBadge level={r.monthlyWinR_provenance} isOverride={r.monthlyWinR_provenance === "month"} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Monthly loss R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.monthlyLossR)}</span>
						<ProvenanceBadge level={r.monthlyLossR_provenance} isOverride={r.monthlyLossR_provenance === "month"} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Target weeks</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{r.monthlyTargetWeeks ?? "—"}</span>
						<ProvenanceBadge level={r.monthlyTargetWeeks_provenance} isOverride={r.monthlyTargetWeeks_provenance === "month"} />
					</dd>
				</div>
			</dl>
		</PlanSection>
	)
}

export { PlanMonthPage as default }
