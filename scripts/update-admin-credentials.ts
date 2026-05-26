import "dotenv/config"
import bcrypt from "bcryptjs"
import { createSeedSql, closeSeedSql, type SeedSql } from "./seed/helpers/sql"

const SALT_ROUNDS = 12

const OLD_EMAIL = process.env.OLD_ADMIN_EMAIL ?? "admin@axion.com"
const NEW_EMAIL = process.env.NEW_ADMIN_EMAIL ?? "admin@bravo.com"

const requireEnv = (key: string): string => {
	const v = process.env[key]
	if (!v || v.trim().length === 0) {
		console.error(`❌ ${key} is required`)
		process.exit(1)
	}
	return v
}

const main = async (): Promise<void> => {
	const databaseUrl = requireEnv("DATABASE_URL")
	const newPassword = requireEnv("ADMIN_PASSWORD")
	const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)

	const sql: SeedSql = createSeedSql(databaseUrl)

	try {
		const before = (await sql`
			SELECT id, email FROM users WHERE email = ${OLD_EMAIL} OR email = ${NEW_EMAIL}
		`) as { id: string; email: string }[]
		console.log(`🔍 Pre-update rows matching old/new email: ${before.length}`)
		for (const r of before) {
			console.log(`   - ${r.email} (${r.id})`)
		}

		const updated = (await sql`
			UPDATE users
			SET email = ${NEW_EMAIL}, password_hash = ${passwordHash}
			WHERE email = ${OLD_EMAIL}
			RETURNING id, email
		`) as { id: string; email: string }[]

		if (updated.length === 0) {
			console.warn(`⚠️  No row matched email=${OLD_EMAIL}. Nothing updated.`)
			process.exit(2)
		}
		if (updated.length > 1) {
			throw new Error(
				`Expected at most 1 row to update, got ${updated.length}. Aborting.`
			)
		}
		const row = updated[0]
		console.log(
			`✅ Updated user ${row.id} → email=${row.email}, password=<bcrypt>`
		)
	} finally {
		await closeSeedSql(sql)
	}
}

main().catch((err) => {
	console.error("❌ update-admin-credentials failed:", err)
	process.exit(1)
})
