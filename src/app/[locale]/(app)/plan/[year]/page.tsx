import { setRequestLocale } from "next-intl/server"
import { requireAuth } from "@/app/actions/auth"
import { resolveYear } from "@/lib/fractal-plan/resolver"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { ProvenanceBadge } from "@/components/fractal-plan/provenance-badge"

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
				<p className="text-text-200">Year must be a 4-digit integer between 2000 and 2100.</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()

	const r = await resolveYear({ accountId, year })

	return (
		<PlanSection
			title={`Plan ${year}`}
			subtitle="Year-level defaults — propagate down to quarter, month, week, day"
		>
			<dl className="grid grid-cols-1 gap-m-300 sm:grid-cols-2">
				<div>
					<dt className="text-sm text-text-200">Default daily loss R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.defaultDailyLossR)}</span>
						<ProvenanceBadge level={r.defaultDailyLossR_provenance} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Default daily win R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.defaultDailyWinR)}</span>
						<ProvenanceBadge level={r.defaultDailyWinR_provenance} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Default weekly loss / win R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">
							{formatR(r.defaultWeeklyLossR)} / {formatR(r.defaultWeeklyWinR)}
						</span>
						<ProvenanceBadge level={r.defaultWeeklyWinR_provenance} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Default monthly loss / win R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">
							{formatR(r.defaultMonthlyLossR)} / {formatR(r.defaultMonthlyWinR)}
						</span>
						<ProvenanceBadge level={r.defaultMonthlyWinR_provenance} />
					</dd>
				</div>
			</dl>
		</PlanSection>
	)
}

export { PlanYearPage as default }
