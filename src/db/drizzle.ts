import {
	drizzle as drizzleNeon,
	type NeonHttpDatabase,
} from "drizzle-orm/neon-http"
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"
import { isNeonUrl } from "./url"

// Driver-agnostic db client.
//
// Production / staging point at Neon and use the HTTPS driver. Worktree dbs
// (or any other plain Postgres) use postgres-js over the native wire protocol.
//
// Both drivers implement Drizzle's query-builder API structurally, but the
// concrete instance types differ enough (schema generic erosion, result shape
// differences like `rowCount` vs `count`) that a union breaks ~13 call sites.
// We narrow the exposed type to `NeonHttpDatabase<typeof schema>` — the
// historical type every consumer was written against — and accept that on
// postgres-js the runtime result objects have a slightly different shape.
// In practice the only divergence in this codebase is `result.rowCount`,
// which is `undefined` (not crashing) on postgres-js.

const url = process.env.DATABASE_URL
if (!url) {
	throw new Error("DATABASE_URL missing")
}

export const db: NeonHttpDatabase<typeof schema> = isNeonUrl(url)
	? drizzleNeon(url, { schema })
	: (drizzlePg(postgres(url, { prepare: false }), {
			schema,
		}) as unknown as NeonHttpDatabase<typeof schema>)
