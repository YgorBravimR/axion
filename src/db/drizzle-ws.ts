import { neonConfig, Pool } from "@neondatabase/serverless"
import {
	drizzle as drizzleNeonWs,
	type NeonDatabase,
} from "drizzle-orm/neon-serverless"
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"
import { isNeonUrl } from "./url"

// Transactional db client.
//
// Neon HTTPS can't do real transactions, so callers that need atomic
// multi-statement work (e.g. hawks-mode actions) use this. On Neon URLs we
// use the WebSocket-backed Pool from `@neondatabase/serverless`; on plain
// Postgres we use postgres-js, which has native transaction support.
//
// Same friendly-cast strategy as ./drizzle: expose the NeonDatabase shape to
// callers regardless of the underlying driver. See drizzle.ts for rationale.

const url = process.env.DATABASE_URL
if (!url) {
	throw new Error("DATABASE_URL missing")
}

const makeClient = (): NeonDatabase<typeof schema> => {
	if (isNeonUrl(url)) {
		if (typeof globalThis.WebSocket === "undefined") {
			throw new Error(
				"Native WebSocket required for neon-serverless transactional client. Node ≥22 expected."
			)
		}
		neonConfig.webSocketConstructor = globalThis.WebSocket as never
		const pool = new Pool({ connectionString: url })
		return drizzleNeonWs(pool, { schema })
	}
	return drizzlePg(postgres(url), {
		schema,
	}) as unknown as NeonDatabase<typeof schema>
}

export const dbWs = makeClient()
