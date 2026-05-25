import bcrypt from "bcryptjs"
import type { SeedSql } from "./helpers/sql"

export const ADMIN_EMAIL = "admin@bravo.com"
const SALT_ROUNDS = 12

const requireAdminPassword = (): string => {
	const pw = process.env.ADMIN_PASSWORD
	if (!pw || pw.trim().length === 0) {
		console.error(
			"❌ ADMIN_PASSWORD environment variable is required to seed.\n" +
				"   Set it before running, e.g.\n" +
				"   ADMIN_PASSWORD='<strong-password>' pnpm db:seed"
		)
		process.exit(1)
	}
	return pw
}

export interface SeededAdmin {
	id: string
	email: string
}

export const seedAdminUser = async (sql: SeedSql): Promise<SeededAdmin> => {
	console.log("\n👤 Creating admin user...")
	const adminPassword = requireAdminPassword()
	const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS)

	const rows = (await sql`
		INSERT INTO users (id, name, email, password_hash, is_admin, role, preferred_locale, theme)
		VALUES (gen_random_uuid(), 'Admin User', ${ADMIN_EMAIL}, ${passwordHash}, true, 'admin', 'pt-BR', 'dark')
		RETURNING id
	`) as { id: string }[]
	const admin = rows[0]
	if (!admin) {
		throw new Error("Failed to create admin user")
	}
	console.log(
		`✅ Admin user created: ${ADMIN_EMAIL} (password from $ADMIN_PASSWORD)`
	)
	return { id: admin.id, email: ADMIN_EMAIL }
}
