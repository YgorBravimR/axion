import type { SeedSql } from "./helpers/sql"

export interface SeededAccount {
	id: string
	name: string
}

export interface SeededAccounts {
	personal: SeededAccount
	prop: SeededAccount
	demo: SeededAccount
}

// 3-account topology (Personal default, Atom prop, Demo empty).
// Commit #3 expands this to 7 accounts with new modes/stories.
export const seedAccounts = async (
	sql: SeedSql,
	adminUserId: string
): Promise<SeededAccounts> => {
	console.log("\n💼 Creating trading accounts...")

	const [personal] = (await sql`
		INSERT INTO trading_accounts (
			id, user_id, name, description, is_default, account_type,
			default_currency
		) VALUES (
			gen_random_uuid(), ${adminUserId}, 'Personal', 'My personal trading account',
			true, 'personal', 'BRL'
		)
		RETURNING id, name
	`) as SeededAccount[]
	if (!personal) {
		throw new Error("Failed to create Personal account")
	}
	console.log("   ✅ Personal account created (default)")

	const [prop] = (await sql`
		INSERT INTO trading_accounts (
			id, user_id, name, description, is_default, account_type,
			prop_firm_name, profit_share_percentage,
			default_currency, show_prop_calculations
		) VALUES (
			gen_random_uuid(), ${adminUserId}, 'Atom Funded', 'My Atom prop firm account',
			false, 'prop', 'Atom', 80.00, 'BRL', true
		)
		RETURNING id, name
	`) as SeededAccount[]
	if (!prop) {
		throw new Error("Failed to create Atom Funded account")
	}
	console.log("   ✅ Atom Prop account created (80% profit share)")

	const [demo] = (await sql`
		INSERT INTO trading_accounts (
			id, user_id, name, description, is_default, account_type,
			default_currency
		) VALUES (
			gen_random_uuid(), ${adminUserId}, 'Demo Account', 'Practice account - no real trades',
			false, 'personal', 'BRL'
		)
		RETURNING id, name
	`) as SeededAccount[]
	if (!demo) {
		throw new Error("Failed to create Demo account")
	}
	console.log("   ✅ Demo account created (empty)")

	return { personal, prop, demo }
}
