import { config } from "dotenv"
import { drizzle } from "drizzle-orm/neon-http"
import { migrate } from "drizzle-orm/neon-http/migrator"

config({ path: ".env" })

const run = async () => {
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error("DATABASE_URL missing")
	}
	const db = drizzle(url)
	await migrate(db, { migrationsFolder: "./src/db/migrations" })
	console.log("migrations applied")
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
