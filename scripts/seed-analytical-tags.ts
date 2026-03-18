/**
 * One-off script to seed 24 analytical/classification tags for a specific user.
 *
 * Tags cover: Zona VTC (11), Trailing (2), Eficiencia (3),
 * Tipo de Entrada (5), Horario (3).
 *
 * Usage:
 *   pnpm tsx scripts/seed-analytical-tags.ts
 */

import "dotenv/config"
import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import * as schema from "../src/db/schema"

const USER_ID = "e30e484f-c65f-4886-98fe-b65360f68da8"

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

interface TagSeed {
	userId: string
	name: string
	type: "general"
	color: string
	description: string
}

const buildTags = (): TagSeed[] => {
	const cyan = "#06B6D4"
	const violet = "#8B5CF6"
	const amber = "#F59E0B"

	return [
		// Zona VTC (11)
		{ userId: USER_ID, name: "ZONA_0", type: "general", color: cyan, description: "Zona VTC 0" },
		{ userId: USER_ID, name: "ZONA_+1", type: "general", color: cyan, description: "Zona VTC +1" },
		{ userId: USER_ID, name: "ZONA_-1", type: "general", color: cyan, description: "Zona VTC -1" },
		{ userId: USER_ID, name: "ZONA_+2", type: "general", color: cyan, description: "Zona VTC +2" },
		{ userId: USER_ID, name: "ZONA_-2", type: "general", color: cyan, description: "Zona VTC -2" },
		{ userId: USER_ID, name: "ZONA_+3", type: "general", color: cyan, description: "Zona VTC +3" },
		{ userId: USER_ID, name: "ZONA_-3", type: "general", color: cyan, description: "Zona VTC -3" },
		{ userId: USER_ID, name: "ZONA_+4", type: "general", color: cyan, description: "Zona VTC +4" },
		{ userId: USER_ID, name: "ZONA_-4", type: "general", color: cyan, description: "Zona VTC -4" },
		{ userId: USER_ID, name: "ZONA_+5", type: "general", color: cyan, description: "Zona VTC +5" },
		{ userId: USER_ID, name: "ZONA_-5", type: "general", color: cyan, description: "Zona VTC -5" },

		// Trailing (2)
		{ userId: USER_ID, name: "TRAIL_SIM", type: "general", color: violet, description: "Trailing: Sim" },
		{ userId: USER_ID, name: "TRAIL_NAO", type: "general", color: violet, description: "Trailing: Não" },

		// Eficiencia (3)
		{ userId: USER_ID, name: "EFF_ALTA", type: "general", color: amber, description: "Eficiência alta (> 0.5)" },
		{ userId: USER_ID, name: "EFF_MEDIA", type: "general", color: amber, description: "Eficiência média (0 a 0.5)" },
		{ userId: USER_ID, name: "EFF_BAIXA", type: "general", color: amber, description: "Eficiência baixa (< 0)" },
	]
}

const main = async () => {
	const tagsToInsert = buildTags()

	console.log(`\nSeeding ${tagsToInsert.length} analytical tags for user ${USER_ID}\n`)

	const inserted = await db.insert(schema.tags).values(tagsToInsert).returning({ id: schema.tags.id, name: schema.tags.name })

	console.log(`Inserted ${inserted.length} tags:`)
	for (const tag of inserted) {
		console.log(`  ${tag.name} (${tag.id})`)
	}

	console.log("\nDone!")
}

main().catch((error) => {
	console.error("Error:", error instanceof Error ? error.message : error)
	process.exit(1)
})
