import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http"
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres"
import * as schema from "../src/db/schema"
import { isLocalUrl } from "../src/db/local-url"

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

const buildLocalSqlTag = (pool: Pool): SqlTag => {
	const tag: SqlTag = async (strings, ...values) => {
		let text = ""
		for (let i = 0; i < strings.length; i++) {
			text += strings[i]
			if (i < values.length) text += `$${i + 1}`
		}
		const result = await pool.query(text, values)
		return result.rows as unknown[]
	}
	return tag
}

interface ScriptDb {
	sql: SqlTag
	db: ReturnType<typeof drizzleNeon<typeof schema>>
	close: () => Promise<void>
}

const getScriptDb = (): ScriptDb => {
	const url = process.env.DATABASE_URL
	if (!url) throw new Error("DATABASE_URL not set")

	if (isLocalUrl(url)) {
		const pool = new Pool({ connectionString: url })
		const sql = buildLocalSqlTag(pool)
		const db = drizzlePg(pool, { schema }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>
		return { sql, db, close: async () => { await pool.end() } }
	}

	const sql = neon(url) as unknown as SqlTag
	const db = drizzleNeon(url, { schema })
	return { sql, db, close: async () => {} }
}

export { getScriptDb, isLocalUrl }
export type { ScriptDb, SqlTag }
