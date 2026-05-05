import { drizzle as drizzleNeon } from "drizzle-orm/neon-http"
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"
import { isLocalUrl } from "./local-url"

const databaseUrl = process.env.DATABASE_URL!

type AnyDb = ReturnType<typeof drizzleNeon<typeof schema>> | ReturnType<typeof drizzlePg<typeof schema>>

const buildDb = (): AnyDb => {
	if (isLocalUrl(databaseUrl)) {
		const pool = new Pool({ connectionString: databaseUrl })
		return drizzlePg(pool, { schema })
	}
	return drizzleNeon(databaseUrl, { schema })
}

export const db = buildDb() as ReturnType<typeof drizzleNeon<typeof schema>>
