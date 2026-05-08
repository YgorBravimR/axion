import { neonConfig, Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"
import * as schema from "./schema"

if (typeof globalThis.WebSocket === "undefined") {
	throw new Error("Native WebSocket required for neon-serverless transactional client. Node ≥22 expected.")
}
neonConfig.webSocketConstructor = globalThis.WebSocket as never

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })

export const dbWs = drizzle(pool, { schema })
