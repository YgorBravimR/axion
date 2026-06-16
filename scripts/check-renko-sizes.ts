import "dotenv/config"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"

const main = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	const rows = (await sql`
		SELECT effective_date, week_number, size_5m, size_15m, size_60m
		FROM hawks_renko_sizes
		ORDER BY effective_date ASC
	`) as Array<{
		effective_date: string
		week_number: number
		size_5m: number
		size_15m: number
		size_60m: number
	}>

	for (const r of rows) {
		console.log(
			`${r.effective_date} week=${r.week_number} 5m=${r.size_5m} 15m=${r.size_15m} 60m=${r.size_60m}`
		)
	}
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
