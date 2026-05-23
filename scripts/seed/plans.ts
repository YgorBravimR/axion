import type { SeedSql } from "./helpers/sql"
import type { SeededAccount, SeededAccounts } from "./accounts"
import type { HawksPlaybookMap } from "./playbooks-hawks"

interface LadderTier {
	minCapitalCents: number
	maxCapitalCents: number
	oneRCents: number
}

// Universal capital → 1R ladder. Five tiers from R$3k floor to R$1M ceiling.
const LADDER: LadderTier[] = [
	{ minCapitalCents: 300_000, maxCapitalCents: 749_999, oneRCents: 10_000 },
	{ minCapitalCents: 750_000, maxCapitalCents: 1_499_999, oneRCents: 20_000 },
	{
		minCapitalCents: 1_500_000,
		maxCapitalCents: 2_999_999,
		oneRCents: 30_000,
	},
	{
		minCapitalCents: 3_000_000,
		maxCapitalCents: 9_999_999,
		oneRCents: 50_000,
	},
	{
		minCapitalCents: 10_000_000,
		maxCapitalCents: 99_999_999_999,
		oneRCents: 100_000,
	},
]

const resolveOneR = (
	capCents: number
): { tierIndex: number; oneRCents: number } => {
	for (let i = 0; i < LADDER.length; i++) {
		const tier = LADDER[i]
		if (
			tier &&
			capCents >= tier.minCapitalCents &&
			capCents <= tier.maxCapitalCents
		) {
			return { tierIndex: i, oneRCents: tier.oneRCents }
		}
	}
	const top = LADDER[LADDER.length - 1]
	if (!top) {
		throw new Error("LADDER is empty")
	}
	return { tierIndex: LADDER.length - 1, oneRCents: top.oneRCents }
}

export interface MonthMeta {
	id: string
	oneRCents: number
	tierIndex: number
	startCents: number
	year: number
	month: number
}

export interface YearCascade {
	year: number
	yearlyId: string
	quarterlyIds: string[]
	monthlyByMonth: Map<number, MonthMeta>
}

export type CascadesByAccount = Map<string, YearCascade[]>

interface YearSpec {
	year: number
	monthlyStartCents: number[]
	notes: string
	defaultDailyLossR: number
	defaultDailyWinR: number
	defaultWeeklyLossR: number
	defaultWeeklyWinR: number
	defaultMonthlyLossR: number
	defaultMonthlyWinR: number
	irTaxRate: string
	tradingDaysPerWeek: number
	overrideActivePlaybookIds?: string[]
	lockCadence?: "weekly" | "monthly"
}

interface AccountPlanSpec {
	account: SeededAccount
	startYear: number
	startMonth: number
	startingBalanceCents: number
	withdrawalTargetPercent: string
	years: YearSpec[]
}

const seedYearlyCascade = async (
	sql: SeedSql,
	accountId: string,
	spec: YearSpec
): Promise<YearCascade> => {
	const initialCapitalCents = spec.monthlyStartCents[0]
	if (initialCapitalCents === undefined) {
		throw new Error(`Year ${spec.year}: monthlyStartCents must have 12 entries`)
	}

	const yearlyRows = (await sql`
		INSERT INTO yearly_plans (
			id, account_id, year, initial_capital_cents, ir_tax_rate, trading_days_per_week,
			ladder_rules, start_week,
			default_daily_loss_r, default_daily_win_r,
			default_weekly_loss_r, default_weekly_win_r,
			default_monthly_loss_r, default_monthly_win_r,
			notes
		) VALUES (
			gen_random_uuid(), ${accountId}, ${spec.year}, ${initialCapitalCents},
			${spec.irTaxRate}, ${spec.tradingDaysPerWeek},
			${JSON.stringify(LADDER)}::jsonb, 1,
			${spec.defaultDailyLossR}, ${spec.defaultDailyWinR},
			${spec.defaultWeeklyLossR}, ${spec.defaultWeeklyWinR},
			${spec.defaultMonthlyLossR}, ${spec.defaultMonthlyWinR},
			${spec.notes}
		)
		RETURNING id
	`) as { id: string }[]
	const yearlyRow = yearlyRows[0]
	if (!yearlyRow) {
		throw new Error(`Failed to insert yearly_plan ${spec.year}`)
	}

	const quarterlyIds: string[] = []
	for (let q = 1; q <= 4; q++) {
		const rows = (await sql`
			INSERT INTO quarterly_plan (id, yearly_plan_id, quarter)
			VALUES (gen_random_uuid(), ${yearlyRow.id}, ${q})
			RETURNING id
		`) as { id: string }[]
		const row = rows[0]
		if (!row) {
			throw new Error(`Failed to insert quarterly_plan Q${q}`)
		}
		quarterlyIds.push(row.id)
	}

	const monthlyByMonth = new Map<number, MonthMeta>()
	const overridePlaybookIdsJson = spec.overrideActivePlaybookIds
		? JSON.stringify(spec.overrideActivePlaybookIds)
		: null
	const lockCadence = spec.lockCadence ?? "monthly"

	for (let m = 1; m <= 12; m++) {
		const startCents = spec.monthlyStartCents[m - 1]
		if (startCents === undefined) {
			throw new Error(
				`Missing monthlyStartCents[${m - 1}] for year ${spec.year}`
			)
		}
		const { tierIndex, oneRCents } = resolveOneR(startCents)
		const quarterlyId = quarterlyIds[Math.floor((m - 1) / 3)]
		if (!quarterlyId) {
			throw new Error(`Missing quarterly for month ${m}`)
		}
		const computedAt = new Date(
			Date.UTC(spec.year, m - 1, 1, 12, 0, 0)
		).toISOString()

		const rows = (await sql`
			INSERT INTO monthly_plan (
				id, quarterly_plan_id, year, month,
				snapshot_capital_cents, snapshot_one_r_cents, snapshot_tier_index,
				snapshot_computed_at, snapshot_reason,
				override_active_playbook_ids, lock_cadence
			) VALUES (
				gen_random_uuid(), ${quarterlyId}, ${spec.year}, ${m},
				${startCents}, ${oneRCents}, ${tierIndex},
				${computedAt}, 'month_start',
				${overridePlaybookIdsJson}::jsonb, ${lockCadence}
			)
			RETURNING id
		`) as { id: string }[]
		const row = rows[0]
		if (!row) {
			throw new Error(`Failed to insert monthly_plan ${spec.year}/${m}`)
		}
		monthlyByMonth.set(m, {
			id: row.id,
			oneRCents,
			tierIndex,
			startCents,
			year: spec.year,
			month: m,
		})
	}

	return {
		year: spec.year,
		yearlyId: yearlyRow.id,
		quarterlyIds,
		monthlyByMonth,
	}
}

const buildAccountSpecs = (
	accounts: SeededAccounts,
	hawksPlaybooks: HawksPlaybookMap
): AccountPlanSpec[] => {
	const hawksPlaybookIds = Object.values(hawksPlaybooks).map(
		(p) => p.strategyId
	)

	return [
		// Personal — preserves the existing cascade behavior (R$3k Jan → R$24k May 2026,
		// March intentionally a losing month for DARF carryover tests).
		{
			account: accounts.personal,
			startYear: 2026,
			startMonth: 1,
			startingBalanceCents: 300_000,
			withdrawalTargetPercent: "0.00",
			years: [
				{
					year: 2026,
					monthlyStartCents: [
						300_000, 750_000, 1_200_000, 1_800_000, 2_400_000, 3_000_000,
						3_000_000, 3_000_000, 3_000_000, 3_000_000, 3_000_000, 3_000_000,
					],
					notes: "Seeded ladder progression — R$3k Jan → R$30k May 2026",
					defaultDailyLossR: 2.0,
					defaultDailyWinR: 4.0,
					defaultWeeklyLossR: 5.0,
					defaultWeeklyWinR: 8.0,
					defaultMonthlyLossR: 10.0,
					defaultMonthlyWinR: 20.0,
					irTaxRate: "30.00",
					tradingDaysPerWeek: 5,
				},
			],
		},
		// Atom Funded — long history account. 2025 starts at R$50k, mixed monthly
		// arc, ends 2025 at ~R$75k. 2026 continues from R$75k through March (then
		// no more plans — account stops at Mar 2026 by design).
		{
			account: accounts.prop,
			startYear: 2025,
			startMonth: 1,
			startingBalanceCents: 5_000_000,
			withdrawalTargetPercent: "30.00",
			years: [
				{
					year: 2025,
					monthlyStartCents: [
						5_000_000, 5_500_000, 5_300_000, 5_800_000, 6_200_000, 6_500_000,
						6_700_000, 6_400_000, 6_800_000, 7_100_000, 7_300_000, 7_500_000,
					],
					notes: "Atom prop — Jan→Dec 2025, mixed arc, +R$25k cum.",
					defaultDailyLossR: 2.0,
					defaultDailyWinR: 4.0,
					defaultWeeklyLossR: 5.0,
					defaultWeeklyWinR: 8.0,
					defaultMonthlyLossR: 10.0,
					defaultMonthlyWinR: 20.0,
					irTaxRate: "30.00",
					tradingDaysPerWeek: 5,
				},
				{
					year: 2026,
					monthlyStartCents: [
						7_500_000, 7_700_000, 8_000_000, 8_000_000, 8_000_000, 8_000_000,
						8_000_000, 8_000_000, 8_000_000, 8_000_000, 8_000_000, 8_000_000,
					],
					notes: "Atom prop — Jan→Mar 2026, continuation. No trades after Mar.",
					defaultDailyLossR: 2.0,
					defaultDailyWinR: 4.0,
					defaultWeeklyLossR: 5.0,
					defaultWeeklyWinR: 8.0,
					defaultMonthlyLossR: 10.0,
					defaultMonthlyWinR: 20.0,
					irTaxRate: "30.00",
					tradingDaysPerWeek: 5,
				},
			],
		},
		// Hawks Pro — R$50k → R$150k across Jan-May 2026. Active playbooks pinned
		// to all 4 Hawks strategies; monthly snapshots advance through tiers.
		{
			account: accounts.hawksPro,
			startYear: 2026,
			startMonth: 1,
			startingBalanceCents: 5_000_000,
			withdrawalTargetPercent: "30.00",
			years: [
				{
					year: 2026,
					monthlyStartCents: [
						5_000_000, 6_500_000, 8_500_000, 11_000_000, 14_000_000, 15_000_000,
						15_000_000, 15_000_000, 15_000_000, 15_000_000, 15_000_000,
						15_000_000,
					],
					notes: "Hawks Pro — R$50k → R$150k by May 2026, Pedro 3x methodology",
					defaultDailyLossR: 2.0,
					defaultDailyWinR: 3.0,
					defaultWeeklyLossR: 4.0,
					defaultWeeklyWinR: 6.0,
					defaultMonthlyLossR: 8.0,
					defaultMonthlyWinR: 15.0,
					irTaxRate: "30.00",
					tradingDaysPerWeek: 5,
					overrideActivePlaybookIds: hawksPlaybookIds,
				},
			],
		},
		// Greenline — good arc. R$50k → R$108k across 2026 with smooth ladder
		// graduation tier 2 → tier 3 around July.
		{
			account: accounts.greenline,
			startYear: 2026,
			startMonth: 1,
			startingBalanceCents: 5_000_000,
			withdrawalTargetPercent: "30.00",
			years: [
				{
					year: 2026,
					monthlyStartCents: [
						5_000_000, 5_400_000, 5_900_000, 6_500_000, 7_200_000, 8_000_000,
						8_700_000, 9_300_000, 9_800_000, 10_200_000, 10_500_000, 10_800_000,
					],
					notes: "Greenline — steady growth, ladder tier 2 → 3 graduation",
					defaultDailyLossR: 2.0,
					defaultDailyWinR: 4.0,
					defaultWeeklyLossR: 5.0,
					defaultWeeklyWinR: 8.0,
					defaultMonthlyLossR: 10.0,
					defaultMonthlyWinR: 20.0,
					irTaxRate: "30.00",
					tradingDaysPerWeek: 5,
				},
			],
		},
		// Stop Loss Lab — bad arc. R$50k → R$25k by April, then forced
		// conservative mode. Daily cap hits and monthly lock-outs in commits #7d.
		{
			account: accounts.stopLossLab,
			startYear: 2026,
			startMonth: 1,
			startingBalanceCents: 5_000_000,
			withdrawalTargetPercent: "30.00",
			years: [
				{
					year: 2026,
					monthlyStartCents: [
						5_000_000, 4_500_000, 3_800_000, 3_000_000, 2_500_000, 2_500_000,
						2_500_000, 2_500_000, 2_500_000, 2_500_000, 2_500_000, 2_500_000,
					],
					notes:
						"Stop Loss Lab — drawdown arc, daily caps hit, lessons recorded",
					defaultDailyLossR: 1.0,
					defaultDailyWinR: 2.0,
					defaultWeeklyLossR: 2.0,
					defaultWeeklyWinR: 4.0,
					defaultMonthlyLossR: 4.0,
					defaultMonthlyWinR: 8.0,
					irTaxRate: "30.00",
					tradingDaysPerWeek: 5,
				},
			],
		},
		// Beginner — small capital, weekly plan lock cadence for early learning UX.
		{
			account: accounts.beginner,
			startYear: 2026,
			startMonth: 1,
			startingBalanceCents: 1_000_000,
			withdrawalTargetPercent: "30.00",
			years: [
				{
					year: 2026,
					monthlyStartCents: [
						1_000_000, 1_050_000, 1_100_000, 1_150_000, 1_200_000, 1_250_000,
						1_300_000, 1_350_000, 1_400_000, 1_450_000, 1_500_000, 1_550_000,
					],
					notes:
						"Beginner — small capital, conservative R-caps, weekly plan lock",
					defaultDailyLossR: 1.0,
					defaultDailyWinR: 1.5,
					defaultWeeklyLossR: 2.0,
					defaultWeeklyWinR: 3.0,
					defaultMonthlyLossR: 4.0,
					defaultMonthlyWinR: 6.0,
					irTaxRate: "15.00",
					tradingDaysPerWeek: 3,
					lockCadence: "weekly",
				},
			],
		},
	]
}

const anchorAccount = async (
	sql: SeedSql,
	spec: AccountPlanSpec
): Promise<void> => {
	await sql`
		UPDATE trading_accounts
		SET starting_balance_cents = ${spec.startingBalanceCents},
		    account_start_year = ${spec.startYear},
		    account_start_month = ${spec.startMonth},
		    withdrawal_target_percent = ${spec.withdrawalTargetPercent}
		WHERE id = ${spec.account.id}
	`
}

export const seedPlanCascades = async (
	sql: SeedSql,
	accounts: SeededAccounts,
	hawksPlaybooks: HawksPlaybookMap
): Promise<CascadesByAccount> => {
	console.log("\n📦 Seeding fractal plan cascades...")

	const specs = buildAccountSpecs(accounts, hawksPlaybooks)
	const result: CascadesByAccount = new Map()

	for (const spec of specs) {
		await anchorAccount(sql, spec)
		const yearCascades: YearCascade[] = []
		for (const year of spec.years) {
			const cascade = await seedYearlyCascade(sql, spec.account.id, year)
			yearCascades.push(cascade)
		}
		result.set(spec.account.id, yearCascades)
		const yearList = spec.years.map((y) => y.year).join(", ")
		console.log(`   ✅ ${spec.account.name} — ${yearList}`)
	}

	console.log("✅ Plan cascades seeded")
	return result
}

export const getMonthCascade = (
	cascades: CascadesByAccount,
	accountId: string,
	year: number,
	month: number
): MonthMeta => {
	const yearCascades = cascades.get(accountId)
	if (!yearCascades) {
		throw new Error(`No cascade for account ${accountId}`)
	}
	const cascade = yearCascades.find((y) => y.year === year)
	if (!cascade) {
		throw new Error(`No cascade for account ${accountId} year ${year}`)
	}
	const monthMeta = cascade.monthlyByMonth.get(month)
	if (!monthMeta) {
		throw new Error(`No monthly_plan for account ${accountId} ${year}/${month}`)
	}
	return monthMeta
}
