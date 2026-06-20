import { setRequestLocale, getTranslations } from "next-intl/server"
import { and, eq, gte, lt } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { trades, yearlyPlans, monthlyTaxLedger } from "@/db/schema"
import { requireAuth, getCurrentAccount } from "@/app/actions/auth"
import { resolveYear } from "@/lib/fractal-plan/resolver"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { ProvenanceBadge } from "@/components/fractal-plan/provenance-badge"
import { YearlyPlanEditor } from "@/components/fractal-plan/yearly-plan-editor"
import { listActiveRiskProfiles } from "@/app/actions/risk-profiles"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"
import { isCockpitEnabled } from "@/lib/flags/fractal-plan"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SetupSummaryCard } from "@/components/fractal-plan/cockpit/setup-summary-card"
import {
	AnnualCockpitGrid,
	type MonthInputRow,
	type RealMonthData,
} from "@/components/fractal-plan/cockpit/annual-cockpit-grid"
import type { WeekData } from "@/components/fractal-plan/cockpit/month-card"
import { TaxTab } from "@/components/fractal-plan/cockpit/tax-tab"
import { WeeklyGridTab } from "@/components/fractal-plan/cockpit/weekly-grid-tab"
import { PayoffMatrixTab } from "@/components/fractal-plan/cockpit/payoff-matrix-tab"
import { ExitConventionTab } from "@/components/fractal-plan/cockpit/exit-convention-tab"
import type { MonthlyDarfRow } from "@/lib/tax/types"
import { getDayTradeIrRate, getDayTradeRateSource } from "@/lib/tax/legal-rates"
import { getActiveAssets } from "@/app/actions/assets"
import { resolveTier } from "@/lib/fractal-plan/capital-ladder"
import { projectFromPace } from "@/lib/fractal-plan/projection"
import type { AssetOption } from "@/components/fractal-plan/cockpit/what-if-calculator"
import { EoyProjectionBanner } from "@/components/fractal-plan/cockpit/eoy-projection-banner"
import { PlanYearGuide } from "@/components/fractal-plan/cockpit/plan-year-guide"

interface PageProps {
	params: Promise<{ locale: string; year: string }>
}

const formatR = (n: number | null): string =>
	n === null ? "—" : `${n.toFixed(2)}R`

const parseDecimal = (raw: string | null): number | null => {
	if (raw === null) {
		return null
	}
	const n = Number(raw)
	return Number.isFinite(n) ? n : null
}

const buildExisting = (row: typeof yearlyPlans.$inferSelect | undefined) =>
	row
		? {
				initialCapitalCents: row.initialCapitalCents,
				ladderRules: row.ladderRules as unknown as LadderRuleR[],
				tradingDaysPerWeek: row.tradingDaysPerWeek,
				defaultAssertivityPercent: row.defaultAssertivityPercent,
				defaultDailyLossR: row.defaultDailyLossR,
				defaultDailyWinR: row.defaultDailyWinR,
				defaultWeeklyLossR: row.defaultWeeklyLossR,
				defaultWeeklyWinR: row.defaultWeeklyWinR,
				defaultMonthlyLossR: row.defaultMonthlyLossR,
				defaultMonthlyWinR: row.defaultMonthlyWinR,
				defaultRiskProfileId: row.defaultRiskProfileId,
				notes: row.notes,
			}
		: null

const PlanYearPage = async ({ params }: PageProps) => {
	const { locale, year: yearStr } = await params
	setRequestLocale(locale)
	const t = await getTranslations({ locale, namespace: "plan" })
	const year = Number(yearStr)
	if (!Number.isInteger(year) || year < 2000 || year > 2100) {
		return (
			<PlanSection title={t("errors.invalidYear")}>
				<p className="text-txt-200">{t("errors.invalidYearBody")}</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()

	const [resolved, row, profilesResult, account, activeAssets] =
		await Promise.all([
			resolveYear({ accountId, year }),
			db.query.yearlyPlans.findFirst({
				where: and(
					eq(yearlyPlans.accountId, accountId),
					eq(yearlyPlans.year, year)
				),
			}),
			listActiveRiskProfiles(),
			getCurrentAccount(),
			getActiveAssets(),
		])

	const availableAssets: AssetOption[] = activeAssets.map((a) => ({
		symbol: a.symbol,
		name: a.name,
		tickSize: a.tickSize,
		tickValueCents: a.tickValue,
	}))

	const defaultInitialCapitalCents =
		account?.startingBalanceCents != null && account.accountStartYear === year
			? account.startingBalanceCents
			: null

	const riskProfiles =
		profilesResult.status === "success" && profilesResult.data
			? profilesResult.data
			: []

	const existing = buildExisting(row)

	if (!isCockpitEnabled()) {
		return (
			<div className="space-y-m-500">
				<PlanSection
					title={t("yearPage.title", { year })}
					subtitle={t("yearPage.subtitle")}
				>
					{existing ? (
						<dl className="gap-s-300 grid grid-cols-1 sm:grid-cols-2">
							<div>
								<dt className="text-txt-200 text-small">
									{t("daily.defaultLossR")}
								</dt>
								<dd className="gap-s-200 mt-s-100 flex items-center">
									<span className="text-txt-100 text-h3 font-mono">
										{formatR(resolved.defaultDailyLossR)}
									</span>
									<ProvenanceBadge
										level={resolved.defaultDailyLossR_provenance}
									/>
								</dd>
							</div>
							<div>
								<dt className="text-txt-200 text-small">
									{t("daily.defaultWinR")}
								</dt>
								<dd className="gap-s-200 mt-s-100 flex items-center">
									<span className="text-txt-100 text-h3 font-mono">
										{formatR(resolved.defaultDailyWinR)}
									</span>
									<ProvenanceBadge
										level={resolved.defaultDailyWinR_provenance}
									/>
								</dd>
							</div>
							<div>
								<dt className="text-txt-200 text-small">
									{t("daily.defaultWeeklyLossWinR")}
								</dt>
								<dd className="gap-s-200 mt-s-100 flex items-center">
									<span className="text-txt-100 text-h3 font-mono">
										{formatR(resolved.defaultWeeklyLossR)} /{" "}
										{formatR(resolved.defaultWeeklyWinR)}
									</span>
									<ProvenanceBadge
										level={resolved.defaultWeeklyWinR_provenance}
									/>
								</dd>
							</div>
							<div>
								<dt className="text-txt-200 text-small">
									{t("daily.defaultMonthlyLossWinR")}
								</dt>
								<dd className="gap-s-200 mt-s-100 flex items-center">
									<span className="text-txt-100 text-h3 font-mono">
										{formatR(resolved.defaultMonthlyLossR)} /{" "}
										{formatR(resolved.defaultMonthlyWinR)}
									</span>
									<ProvenanceBadge
										level={resolved.defaultMonthlyWinR_provenance}
									/>
								</dd>
							</div>
						</dl>
					) : (
						<p className="text-txt-200">{t("daily.noYearlyPlan", { year })}</p>
					)}
				</PlanSection>

				<PlanSection
					title={
						existing
							? t("yearPage.editDefaultsTitle")
							: t("yearPage.seedDefaultsTitle")
					}
					subtitle={t("yearPage.editDefaultsSubtitle")}
				>
					<YearlyPlanEditor
						year={year}
						accountId={accountId}
						existing={existing}
						riskProfiles={riskProfiles}
						defaultInitialCapitalCents={defaultInitialCapitalCents}
					/>
				</PlanSection>
			</div>
		)
	}

	// Cockpit branch — pull full year tree for the grid.
	const [tree, ledgerRows] = await Promise.all([
		row
			? db.query.yearlyPlans.findFirst({
					where: eq(yearlyPlans.id, row.id),
					with: {
						quarterlyPlans: {
							with: {
								months: {
									with: {
										weeklyPlans: true,
									},
								},
							},
						},
					},
				})
			: Promise.resolve(null),
		db
			.select()
			.from(monthlyTaxLedger)
			.where(
				and(
					eq(monthlyTaxLedger.accountId, accountId),
					gte(monthlyTaxLedger.month, new Date(Date.UTC(year, 0, 1))),
					lt(monthlyTaxLedger.month, new Date(Date.UTC(year + 1, 0, 1)))
				)
			),
	])

	const monthRows: MonthInputRow[] = []
	if (tree) {
		for (const q of tree.quarterlyPlans) {
			for (const m of q.months.filter((mp) => mp.year === year)) {
				const weeks: WeekData[] = m.weeklyPlans
					.slice()
					.sort((a, b) => a.isoWeek - b.isoWeek)
					.map((w) => ({
						isoWeek: w.isoWeek,
						targetR: parseDecimal(w.targetR),
						actualR: parseDecimal(w.actualR),
					}))
				monthRows.push({
					monthIndex: m.month - 1,
					monthlyPlanId: m.id,
					quarter: q.quarter,
					snapshotCapitalCents: m.snapshotCapitalCents,
					snapshotOneRCents: m.snapshotOneRCents,
					snapshotTierIndex: m.snapshotTierIndex,
					snapshotReason: m.snapshotReason,
					weeks,
				})
			}
		}
	}

	const taxRows: MonthlyDarfRow[] = (ledgerRows as unknown as MonthlyDarfRow[])
		.slice()
		.sort((a, b) => a.month.getTime() - b.month.getTime())

	const irTaxRate = getDayTradeIrRate(year)
	const irTaxRateSource = getDayTradeRateSource(year)
	const withdrawalPct =
		account?.withdrawalTargetPercent != null
			? Number(account.withdrawalTargetPercent) / 100
			: 0
	const tradingDaysPerWeek = row?.tradingDaysPerWeek ?? 5
	const initialCapitalCents =
		defaultInitialCapitalCents ?? row?.initialCapitalCents ?? 0
	const ladderRules = (row?.ladderRules as unknown as LadderRuleR[]) ?? []
	const accountStartYear = account?.accountStartYear ?? null
	const accountStartMonth = account?.accountStartMonth ?? null

	const today = new Date()
	const currentMonthIndex = today.getFullYear() === year ? today.getMonth() : -1

	const yearStart = new Date(Date.UTC(year, 0, 1))
	const yearEnd = new Date(Date.UTC(year + 1, 0, 1))
	const yearTrades = await db
		.select({
			entryDate: trades.entryDate,
			rOutcome: trades.rOutcome,
			pnl: trades.pnl,
		})
		.from(trades)
		.where(
			and(
				eq(trades.accountId, accountId),
				eq(trades.isArchived, false),
				gte(trades.entryDate, yearStart),
				lt(trades.entryDate, yearEnd)
			)
		)

	const realByMonth: RealMonthData[] = Array.from({ length: 12 }, (_, i) => ({
		monthIndex: i,
		tradesCount: 0,
		realPnlCents: 0,
		realRSum: 0,
		tradingDaysWithTrades: 0,
		weeklyR: [],
	}))
	const dayKeySetByMonth: Set<string>[] = Array.from(
		{ length: 12 },
		() => new Set()
	)
	const weekIsoBucketsByMonth: Map<number, number>[] = Array.from(
		{ length: 12 },
		(): Map<number, number> => new Map()
	)
	const isoWeekOf = (d: Date): number => {
		const t = new Date(
			Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
		)
		const dayNum = t.getUTCDay() || 7
		t.setUTCDate(t.getUTCDate() + 4 - dayNum)
		const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
		return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
	}

	const grossPnlByMonth = Array.from({ length: 12 }, () => 0)
	for (const t of yearTrades) {
		const r = t.rOutcome !== null ? Number(t.rOutcome) : 0
		const pnlCents = t.pnl !== null ? Number(t.pnl) : 0
		const m = t.entryDate.getUTCMonth()
		const dayKey = t.entryDate.toISOString().slice(0, 10)
		dayKeySetByMonth[m]!.add(dayKey)
		realByMonth[m]!.tradesCount += 1
		grossPnlByMonth[m]! += pnlCents
		realByMonth[m]!.realRSum += r
		const iso = isoWeekOf(t.entryDate)
		const map = weekIsoBucketsByMonth[m]!
		map.set(iso, (map.get(iso) ?? 0) + r)
	}
	for (let i = 0; i < 12; i++) {
		const gross = grossPnlByMonth[i]!
		const tax = gross > 0 ? Math.round(gross * irTaxRate) : 0
		const netAfterTax = gross - tax
		const wd =
			netAfterTax > 0 && withdrawalPct > 0
				? Math.round(netAfterTax * withdrawalPct)
				: 0
		realByMonth[i]!.realPnlCents = netAfterTax - wd
	}
	for (let i = 0; i < 12; i++) {
		realByMonth[i]!.tradingDaysWithTrades = dayKeySetByMonth[i]!.size
		realByMonth[i]!.weeklyR = Array.from(weekIsoBucketsByMonth[i]!.entries())
			.sort(([a], [b]) => a - b)
			.map(([isoWeek, sumR]) => ({ isoWeek, sumR }))
	}

	const lastActualMonthIdx = (() => {
		for (let i = 11; i >= 0; i--) {
			if (realByMonth[i]!.tradesCount > 0) {
				return i
			}
		}
		return -1
	})()

	const totalRealRSum = realByMonth.reduce((acc, m) => acc + m.realRSum, 0)
	const totalDaysWithTrades = realByMonth.reduce(
		(acc, m) => acc + m.tradingDaysWithTrades,
		0
	)
	const avgRPerDayYtd =
		totalDaysWithTrades > 0 ? totalRealRSum / totalDaysWithTrades : 0

	let realEndBalanceCents = initialCapitalCents
	for (let i = 0; i <= lastActualMonthIdx && i < 12; i++) {
		realEndBalanceCents += realByMonth[i]!.realPnlCents
	}

	let currentMonthRemainder: {
		addedRsum: number
		addedNetCents: number
		projectedEndBalanceCents: number
	} | null = null
	if (
		currentMonthIndex >= 0 &&
		currentMonthIndex === lastActualMonthIdx &&
		avgRPerDayYtd > 0 &&
		ladderRules.length > 0
	) {
		const m = currentMonthIndex
		const lastDay = new Date(Date.UTC(year, m + 1, 0))
		let weekdaysRemaining = 0
		const cur = new Date(Date.UTC(year, m, today.getDate() + 1))
		while (cur <= lastDay) {
			const d = cur.getUTCDay()
			if (d !== 0 && d !== 6) {
				weekdaysRemaining++
			}
			cur.setUTCDate(cur.getUTCDate() + 1)
		}
		if (weekdaysRemaining > 0) {
			// Mirror annual-cockpit-grid: only trust the monthly snapshot when the
			// reason is "manual"; otherwise the snapshot is just a stale month-start
			// seed and we want the running capital (= account starting balance,
			// since June is the first month of trades for this account).
			const monthRow = monthRows.find((r) => r.monthIndex === m)
			const monthStartCapital =
				monthRow?.snapshotReason === "manual"
					? monthRow.snapshotCapitalCents
					: initialCapitalCents
			const realEnd = monthStartCapital + realByMonth[m]!.realPnlCents
			const oneRForMonth = resolveTier(realEnd, ladderRules).oneRCents
			const addedRsum = avgRPerDayYtd * weekdaysRemaining
			const addedGross = Math.round(addedRsum * oneRForMonth)
			const tax = addedGross > 0 ? Math.round(addedGross * irTaxRate) : 0
			const netAfterTax = addedGross - tax
			const wd =
				netAfterTax > 0 && withdrawalPct > 0
					? Math.round(netAfterTax * withdrawalPct)
					: 0
			const addedNet = netAfterTax - wd
			currentMonthRemainder = {
				addedRsum,
				addedNetCents: addedNet,
				projectedEndBalanceCents: realEnd + addedNet,
			}
		}
	}

	const paceStartBalanceCents =
		realEndBalanceCents + (currentMonthRemainder?.addedNetCents ?? 0)
	const monthsRemaining = lastActualMonthIdx >= 0 ? 11 - lastActualMonthIdx : 0
	const eoy =
		monthsRemaining > 0 && avgRPerDayYtd > 0
			? projectFromPace({
					startBalanceCents: paceStartBalanceCents,
					monthsRemaining,
					avgRPerDayYtd,
					tradingDaysPerWeek,
					ladderRules,
					irTaxRate,
					withdrawalPct,
				})
			: null

	const paceByMonthIdx = new Map<
		number,
		{
			endBalanceCents: number
			oneRCents: number
			netLiquidCents: number
			grossPnlCents: number
		}
	>()
	if (eoy) {
		for (let k = 0; k < eoy.months.length; k++) {
			const m = eoy.months[k]!
			paceByMonthIdx.set(lastActualMonthIdx + 1 + k, {
				endBalanceCents: m.endBalanceCents,
				oneRCents: m.oneRCents,
				netLiquidCents: m.netLiquidCents,
				grossPnlCents: m.grossPnlCents,
			})
		}
	}

	const currentTierResolution =
		ladderRules.length > 0
			? resolveTier(initialCapitalCents, ladderRules)
			: null
	const currentOneRCents = currentTierResolution?.oneRCents ?? 0
	const currentTierIndex = currentTierResolution?.tierIndex ?? null

	if (!row) {
		return (
			<div className="space-y-m-500">
				<SetupSummaryCard
					accountId={accountId}
					year={year}
					initialCapitalCents={initialCapitalCents}
					ladderRules={ladderRules}
					tradingDaysPerWeek={tradingDaysPerWeek}
					defaultDailyLossR={null}
					defaultDailyWinR={null}
					defaultMonthlyLossR={null}
					defaultMonthlyWinR={null}
					irTaxRate={irTaxRate}
					irTaxRateSource={irTaxRateSource}
					withdrawalPct={withdrawalPct}
					riskProfiles={riskProfiles}
					existing={existing}
					defaultInitialCapitalCents={defaultInitialCapitalCents}
					currentOneRCents={currentOneRCents}
					availableAssets={availableAssets}
					activeTierIndex={currentTierIndex}
				/>
				<PlanSection
					title={t("yearPage.notCreatedTitle", { year })}
					subtitle={t("yearPage.notCreatedSubtitle")}
				>
					<p className="text-small text-txt-300">
						{t("yearPage.notCreatedBody")}
					</p>
				</PlanSection>
			</div>
		)
	}

	return (
		<div className="space-y-m-500">
			<SetupSummaryCard
				accountId={accountId}
				year={year}
				initialCapitalCents={initialCapitalCents}
				ladderRules={ladderRules}
				tradingDaysPerWeek={tradingDaysPerWeek}
				defaultDailyLossR={parseDecimal(row.defaultDailyLossR)}
				defaultDailyWinR={parseDecimal(row.defaultDailyWinR)}
				defaultMonthlyLossR={parseDecimal(row.defaultMonthlyLossR)}
				defaultMonthlyWinR={parseDecimal(row.defaultMonthlyWinR)}
				irTaxRate={irTaxRate}
				irTaxRateSource={irTaxRateSource}
				withdrawalPct={withdrawalPct}
				riskProfiles={riskProfiles}
				existing={existing}
				defaultInitialCapitalCents={defaultInitialCapitalCents}
				currentOneRCents={currentOneRCents}
				availableAssets={availableAssets}
			/>

			<PlanYearGuide />
			<Tabs defaultValue="plan">
				<TabsList id="plan-year-tabs" variant="line">
					<TabsTrigger value="plan">{t("yearPage.tabPlan")}</TabsTrigger>
					<TabsTrigger value="weekly-grid">
						{t("yearPage.tabWeeklyGrid")}
					</TabsTrigger>
					<TabsTrigger value="payoff">{t("yearPage.tabPayoff")}</TabsTrigger>
					<TabsTrigger value="exits">{t("yearPage.tabExits")}</TabsTrigger>
					<TabsTrigger value="impostos">{t("yearPage.tabTax")}</TabsTrigger>
				</TabsList>
				<TabsContent value="plan">
					{eoy && (
						<EoyProjectionBanner
							realEndBalanceCents={realEndBalanceCents}
							projectedEoyBalanceCents={eoy.endBalanceCents}
							initialCapitalCents={initialCapitalCents}
							totalRentPctEoy={eoy.totalRentPct}
							avgRPerDayYtd={avgRPerDayYtd}
							lastActualMonthIdx={lastActualMonthIdx}
						/>
					)}
					<AnnualCockpitGrid
						year={year}
						locale={locale}
						currentMonthIndex={currentMonthIndex}
						tradingDaysPerWeek={tradingDaysPerWeek}
						irTaxRate={irTaxRate}
						withdrawalPct={withdrawalPct}
						initialCapitalCents={initialCapitalCents}
						ladderRules={ladderRules}
						accountStartYear={accountStartYear}
						accountStartMonth={accountStartMonth}
						months={monthRows}
						realByMonth={realByMonth}
						lastActualMonthIdx={lastActualMonthIdx}
						paceByMonthIdx={Object.fromEntries(paceByMonthIdx)}
						currentMonthRemainder={currentMonthRemainder}
						defaultDailyWinR={parseDecimal(row.defaultDailyWinR)}
						assertivityPct={parseDecimal(row.defaultAssertivityPercent) ?? 50}
					/>
				</TabsContent>
				<TabsContent value="weekly-grid">
					<WeeklyGridTab
						year={year}
						months={monthRows}
						currentMonthIndex={currentMonthIndex}
					/>
				</TabsContent>
				<TabsContent value="payoff">
					<PayoffMatrixTab
						initialCapitalCents={initialCapitalCents}
						tradingDaysPerWeek={tradingDaysPerWeek}
						currentOneRCents={currentOneRCents}
					/>
				</TabsContent>
				<TabsContent value="exits">
					<ExitConventionTab />
				</TabsContent>
				<TabsContent value="impostos">
					<TaxTab
						accountId={accountId}
						accountType={account?.accountType ?? "personal"}
						year={year}
						rows={taxRows}
					/>
				</TabsContent>
			</Tabs>
		</div>
	)
}

export { PlanYearPage as default }
