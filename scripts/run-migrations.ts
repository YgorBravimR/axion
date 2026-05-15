import { config } from "dotenv"
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http"
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator"
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js"
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"

config({ path: ".env" })

const MIGRATIONS_FOLDER = "./src/db/migrations"

const run = async () => {
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error("DATABASE_URL missing")
	}

	if (isNeonUrl(url)) {
		const db = drizzleNeon(url)
		await migrateNeon(db, { migrationsFolder: MIGRATIONS_FOLDER })
	} else {
		const client = postgres(url, { max: 1 })
		try {
			const db = drizzlePg(client)
			await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER })
		} finally {
			await client.end()
		}
	}
	console.log("migrations applied")
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
