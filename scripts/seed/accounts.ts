import type { SeedSql } from "./helpers/sql"

// C7 (2026-09-01): ONE account. Nothing else.
//
// The previous seed created seven — Personal, Atom Funded, Demo, Hawks Pro,
// Greenline, Stop Loss Lab, Beginner — as demo personas with generated trade
// narratives. All of them were test data and were cleared. The backtest account
// in particular ran 208 trades against the synthetic Renko table, so its R
// multiples were computed off fabricated box sizes.
//
// Mode is `hawks` because this rebuild is Hawks-only.

export interface SeededAccount {
	id: string
	name: string
}

export interface SeededAccounts {
	primary: SeededAccount
	all: SeededAccount[]
}

const ACCOUNT = {
	name: "Hawks",
	description:
		"Conta única, metodologia Hawks (Pedro Palmezani). Renko triple-screen, stop sempre do 5min, 1 contrato. Ver playbook.md §18 para o overlay do Ygor.",
	isDefault: true,
	accountType: "personal" as const,
	defaultCurrency: "BRL",
	mode: "hawks" as const,
}

export const seedAccounts = async (
	sql: SeedSql,
	adminUserId: string
): Promise<SeededAccounts> => {
	console.log("\n💼 Creating trading account...")

	const rows = (await sql`
		INSERT INTO trading_accounts (
			id, user_id, name, description, is_default, account_type,
			prop_firm_name, profit_share_percentage,
			default_currency, show_prop_calculations
		) VALUES (
			gen_random_uuid(), ${adminUserId}, ${ACCOUNT.name}, ${ACCOUNT.description},
			${ACCOUNT.isDefault}, ${ACCOUNT.accountType},
			${null}, ${100},
			${ACCOUNT.defaultCurrency}, ${false}
		)
		RETURNING id, name
	`) as SeededAccount[]

	const account = rows[0]
	if (!account) {
		throw new Error("Failed to create the trading account")
	}

	await sql`
		INSERT INTO account_modes (id, account_id, user_id, mode)
		VALUES (gen_random_uuid(), ${account.id}, ${adminUserId}, ${ACCOUNT.mode})
	`

	console.log(`   ✅ ${account.name} (Hawks Mode, default)`)
	return { primary: account, all: [account] }
}
