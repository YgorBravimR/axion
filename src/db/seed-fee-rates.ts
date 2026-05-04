import { db } from "@/db/drizzle"
import { tradingAccounts, accountFeeRates } from "@/db/schema"

// Seeds accountFeeRates defaults for all existing tradingAccounts.
// Personal accounts: subjectToPersonalIr = true (default).
// Prop accounts: subjectToPersonalIr = false.
// Replay accounts: subjectToPersonalIr = false (engine skips them anyway).
const seedFeeRates = async (): Promise<void> => {
	const accounts = await db.select({
		id: tradingAccounts.id,
		accountType: tradingAccounts.accountType,
	}).from(tradingAccounts)

	for (const account of accounts) {
		const isPersonal = account.accountType === "personal"
		await db
			.insert(accountFeeRates)
			.values({
				accountId: account.id,
				assetSymbol: null,
				txCorretagemCents: 5,
				txRegistroCents: 74,
				emolumentosCents: 40,
				issRatePercent: "5.00",
				irrfRateBps: 100,
				irRateBps: 2000,
				subjectToPersonalIr: isPersonal,
			})
			.onConflictDoNothing()

		console.log(`Seeded fee rates for account ${account.id} (${account.accountType})`)
	}

	console.log(`Done. Seeded ${accounts.length} accounts.`)
}

seedFeeRates()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})
