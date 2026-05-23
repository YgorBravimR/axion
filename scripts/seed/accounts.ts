import type { SeedSql } from "./helpers/sql"

export interface SeededAccount {
	id: string
	name: string
}

export interface SeededAccounts {
	// Legacy keys preserved so plan-cascade / strategies / tags consumers
	// keep working unchanged.
	personal: SeededAccount
	prop: SeededAccount
	demo: SeededAccount
	// Phase-2 additions (commit #3+). Plans, trades, and Hawks data
	// for these arrive in later commits.
	hawksPro: SeededAccount
	greenline: SeededAccount
	stopLossLab: SeededAccount
	beginner: SeededAccount
	all: SeededAccount[]
}

interface AccountSpec {
	key: keyof Omit<SeededAccounts, "all">
	name: string
	description: string
	isDefault: boolean
	accountType: "personal" | "prop"
	propFirmName?: string
	profitSharePercentage?: number
	defaultCurrency: string
	showPropCalculations?: boolean
	mode: "default" | "hawks"
}

const ACCOUNT_SPECS: AccountSpec[] = [
	{
		key: "personal",
		name: "Personal",
		description: "My personal trading account",
		isDefault: true,
		accountType: "personal",
		defaultCurrency: "BRL",
		mode: "default",
	},
	{
		key: "prop",
		name: "Atom Funded",
		description:
			"Atom prop firm account — Jan 2025 → Mar 2026 history, 80% profit share",
		isDefault: false,
		accountType: "prop",
		propFirmName: "Atom",
		profitSharePercentage: 80,
		defaultCurrency: "BRL",
		showPropCalculations: true,
		mode: "default",
	},
	{
		key: "demo",
		name: "Demo Account",
		description: "Practice account — empty / UI testing target",
		isDefault: false,
		accountType: "personal",
		defaultCurrency: "BRL",
		mode: "default",
	},
	{
		key: "hawksPro",
		name: "Hawks Pro",
		description:
			"Hawks Mode — Pedro Palmezani triple-screen Renko methodology with full playbook + OCO",
		isDefault: false,
		accountType: "personal",
		defaultCurrency: "BRL",
		mode: "hawks",
	},
	{
		key: "greenline",
		name: "Greenline",
		description:
			"Good-arc demo — 2026 ladder graduation, tier 2 → tier 3 progression",
		isDefault: false,
		accountType: "personal",
		defaultCurrency: "BRL",
		mode: "default",
	},
	{
		key: "stopLossLab",
		name: "Stop Loss Lab",
		description:
			"Bad-arc demo — 2026 drawdown lock-outs, daily caps hit, lessons recorded",
		isDefault: false,
		accountType: "personal",
		defaultCurrency: "BRL",
		mode: "default",
	},
	{
		key: "beginner",
		name: "Beginner",
		description:
			"Beginner persona — small capital, conservative R-caps, weekly plan lock",
		isDefault: false,
		accountType: "personal",
		defaultCurrency: "BRL",
		mode: "default",
	},
]

const insertAccount = async (
	sql: SeedSql,
	adminUserId: string,
	spec: AccountSpec
): Promise<SeededAccount> => {
	const rows = (await sql`
		INSERT INTO trading_accounts (
			id, user_id, name, description, is_default, account_type,
			prop_firm_name, profit_share_percentage,
			default_currency, show_prop_calculations
		) VALUES (
			gen_random_uuid(), ${adminUserId}, ${spec.name}, ${spec.description},
			${spec.isDefault}, ${spec.accountType},
			${spec.propFirmName ?? null}, ${spec.profitSharePercentage ?? 100},
			${spec.defaultCurrency}, ${spec.showPropCalculations ?? false}
		)
		RETURNING id, name
	`) as SeededAccount[]
	const account = rows[0]
	if (!account) {
		throw new Error(`Failed to create account "${spec.name}"`)
	}
	return account
}

const insertAccountMode = async (
	sql: SeedSql,
	accountId: string,
	userId: string,
	mode: "default" | "hawks"
): Promise<void> => {
	await sql`
		INSERT INTO account_modes (id, account_id, user_id, mode)
		VALUES (gen_random_uuid(), ${accountId}, ${userId}, ${mode})
	`
}

export const seedAccounts = async (
	sql: SeedSql,
	adminUserId: string
): Promise<SeededAccounts> => {
	console.log("\n💼 Creating trading accounts...")

	// trading_accounts cascade clears account_modes on delete, so cleanup.ts
	// running before this already swept the rows. The explicit DELETE here is
	// a no-op in the standard flow + a guardrail for partial reseeds.
	await sql`DELETE FROM account_modes`

	const seeded = new Map<AccountSpec["key"], SeededAccount>()
	for (const spec of ACCOUNT_SPECS) {
		const account = await insertAccount(sql, adminUserId, spec)
		await insertAccountMode(sql, account.id, adminUserId, spec.mode)
		seeded.set(spec.key, account)
		const modeLabel = spec.mode === "hawks" ? " (Hawks Mode)" : ""
		console.log(`   ✅ ${spec.name}${modeLabel}`)
	}

	const get = (key: AccountSpec["key"]): SeededAccount => {
		const account = seeded.get(key)
		if (!account) {
			throw new Error(`Missing seeded account: ${key}`)
		}
		return account
	}

	const accounts: SeededAccounts = {
		personal: get("personal"),
		prop: get("prop"),
		demo: get("demo"),
		hawksPro: get("hawksPro"),
		greenline: get("greenline"),
		stopLossLab: get("stopLossLab"),
		beginner: get("beginner"),
		all: [],
	}
	accounts.all = [
		accounts.personal,
		accounts.prop,
		accounts.demo,
		accounts.hawksPro,
		accounts.greenline,
		accounts.stopLossLab,
		accounts.beginner,
	]
	return accounts
}
