import { setRequestLocale } from "next-intl/server"
import { Suspense } from "react"
import { requireAuth, getCurrentAccount } from "@/app/actions/auth"
import { getServerEffectiveNow } from "@/lib/effective-date"
import {
	MonthClosingSkeleton,
	WeeklyReportCardSkeleton,
	MonthlyReportCardSkeleton,
	MistakeCostCardSkeleton,
	CommissionFeeImpactCardSkeleton,
	AnnualRollupSkeleton,
	WeeklyMetaSkeleton,
	RDistributionSkeleton,
	AnnualTaxSkeleton,
	CarryoverLedgerSkeleton,
} from "@/components/reports/report-skeletons"
import {
	MonthClosingSection,
	WeeklyReportCardAsync,
	MonthlyReportCardAsync,
	MistakeCostCardAsync,
	CommissionFeeImpactCardAsync,
	AnnualReportSectionAsync,
	TaxSectionAsync,
	RDistributionSectionAsync,
} from "@/components/reports/async-sections"
import { DarfAlertBanner } from "@/components/reports/darf-alert-banner"

interface ReportsPageProps {
	params: Promise<{ locale: string }>
}

const ReportsPage = async ({ params }: ReportsPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	const { accountId: currentAccountId } = await requireAuth()
	const now = await getServerEffectiveNow()
	const currentYear = now.getFullYear()
	const currentMonth = now.getMonth() + 1

	const currentAccount = await getCurrentAccount().catch(() => null)
	const accountType = currentAccount?.accountType ?? "personal"

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-auto">
				<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
					{/* DARF overdue / pending alert — short-circuits to null when there's
					    nothing to file. Lives above month-closing so it can't be missed. */}
					<Suspense fallback={null}>
						<DarfAlertBanner accountId={currentAccountId} locale={locale} />
					</Suspense>

					{/* Month Closing Section */}
					<Suspense fallback={<MonthClosingSkeleton />}>
						<MonthClosingSection
							currentAccountId={currentAccountId}
							currentYear={currentYear}
							currentMonth={currentMonth}
							accountType={accountType}
						/>
					</Suspense>

					{/* Weekly and Monthly side by side */}
					<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid md:grid-cols-2 lg:grid-cols-2">
						<Suspense fallback={<WeeklyReportCardSkeleton />}>
							<WeeklyReportCardAsync />
						</Suspense>
						<Suspense fallback={<MonthlyReportCardSkeleton />}>
							<MonthlyReportCardAsync />
						</Suspense>
					</div>

					{/* Mistake Cost */}
					<Suspense fallback={<MistakeCostCardSkeleton />}>
						<MistakeCostCardAsync />
					</Suspense>

					{/* Commission & Fee Impact */}
					<Suspense fallback={<CommissionFeeImpactCardSkeleton />}>
						<CommissionFeeImpactCardAsync />
					</Suspense>

					{/* Annual Report Section */}
					<Suspense
						fallback={
							<>
								<AnnualRollupSkeleton />
								<WeeklyMetaSkeleton />
							</>
						}
					>
						<AnnualReportSectionAsync currentYear={currentYear} />
					</Suspense>

					{/* Tax Section */}
					<Suspense
						fallback={
							<>
								<AnnualTaxSkeleton />
								<CarryoverLedgerSkeleton />
							</>
						}
					>
						<TaxSectionAsync
							currentYear={currentYear}
							currentAccountId={currentAccountId}
						/>
					</Suspense>

					{/* R-Distribution Section */}
					<section
						aria-labelledby="r-dist-section-heading"
						className="space-y-m-400"
					>
						<div className="gap-s-200 flex items-center">
							<span
								className="bg-acc-100 h-1.5 w-1.5 rounded-full"
								aria-hidden="true"
							/>
							<h2
								id="r-dist-section-heading"
								className="text-txt-200 text-tiny tracking-wider uppercase"
							>
								R Distribution — {currentYear}
							</h2>
						</div>
						<Suspense fallback={<RDistributionSkeleton />}>
							<RDistributionSectionAsync
								from={new Date(currentYear, 0, 1)}
								to={new Date(currentYear, 11, 31, 23, 59, 59)}
							/>
						</Suspense>
					</section>
				</div>
			</div>
		</div>
	)
}

export { ReportsPage as default }
