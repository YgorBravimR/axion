import {
	drizzle as drizzleNeon,
	type NeonDatabase,
} from "drizzle-orm/neon-serverless"
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js"
import { neonConfig } from "@neondatabase/serverless"
import postgres from "postgres"
import * as schema from "./schema"
import { isNeonUrl } from "./url"

// Configure WebSocket for Node runtime (production uses serverless with transaction support).
// Edge runtime (if ever used) has built-in WebSocket via global.
// Top-level await: blocks module init until the polyfill is attached, so no query
// can race the dynamic import on a cold start. Cost is paid once per process —
// subsequent imports of this module hit the resolved module cache.
if (typeof window === "undefined" && typeof WebSocket === "undefined") {
	try {
		const ws = await import("ws")
		neonConfig.webSocketConstructor = ws.default
	} catch {
		// ws optional if running in Edge runtime with global WebSocket
	}
}

// Driver-agnostic db client.
//
// Production / staging point at Neon and use the serverless driver (WebSocket-backed),
// which supports transactions. Worktree dbs (or any other plain Postgres) use postgres-js
// over the native wire protocol.
//
// Both drivers implement Drizzle's query-builder API structurally, but the concrete
// instance types differ enough (schema generic erosion, result shape differences like
// `rowCount` vs `count`) that a union breaks ~13 call sites. We narrow the exposed
// type to `NeonDatabase<typeof schema>` — compatible with all consumers — and accept
// that on postgres-js the runtime result objects have a slightly different shape.
// In practice the only divergence in this codebase is `result.rowCount`,
// which is `undefined` (not crashing) on postgres-js.
//
// Transactions are now fully supported on Neon (serverless driver).

const url = process.env.DATABASE_URL
if (!url) {
	throw new Error("DATABASE_URL missing")
}

export const db: NeonDatabase<typeof schema> = isNeonUrl(url)
	? drizzleNeon(url, { schema })
	: (drizzlePg(postgres(url, { prepare: false }), {
			schema,
		}) as unknown as NeonDatabase<typeof schema>)
