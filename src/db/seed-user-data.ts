/**
 * Default seed data for new user accounts.
 * Creates starter strategies and tags so users have a working baseline.
 *
 * Based on reference user ae3be5b8-07d4-436d-8a84-03d9c493e3b6
 */
import { db } from "@/db/drizzle"
import { strategies, tags } from "@/db/schema"

interface SeedStrategy {
	code: string
	name: string
	description: string | null
	targetRMultiple: string | null
	maxRiskPercent: string | null
	isActive: boolean
}

interface SeedTag {
	name: string
	type: "setup" | "mistake" | "general"
	color: string
	description: string | null
}

const DEFAULT_STRATEGIES: SeedStrategy[] = [
	{
		code: "RJCT",
		name: "Rejeição",
		description: "Rejeição de ponto de decisão importante",
		targetRMultiple: "2.00",
		maxRiskPercent: "1.00",
		isActive: true,
	},
	{
		code: "RPMT",
		name: "Rompimento",
		description: "Rompimento de ponto importante",
		targetRMultiple: "2.00",
		maxRiskPercent: "1.00",
		isActive: true,
	},
	{
		code: "VWBR",
		name: "VWAP mercado a vista",
		description: null,
		targetRMultiple: null,
		maxRiskPercent: null,
		isActive: true,
	},
	{
		code: "VWUS",
		name: "VWAP mercado americano",
		description: null,
		targetRMultiple: null,
		maxRiskPercent: null,
		isActive: true,
	},
	{
		code: "CME",
		name: "CME - Chicaco Mercantil Exchange",
		description: null,
		targetRMultiple: null,
		maxRiskPercent: null,
		isActive: true,
	},
	{
		code: "DEZK",
		name: "10k",
		description: null,
		targetRMultiple: null,
		maxRiskPercent: null,
		isActive: true,
	},
]

const DEFAULT_TAGS: SeedTag[] = [
	// Setup tags
	{
		name: "Rompimento",
		type: "setup",
		color: "#3B82F6",
		description: null,
	},
	{
		name: "Rejeição",
		type: "setup",
		color: "#10B981",
		description: null,
	},
	{
		name: "Ajuste",
		type: "setup",
		color: "#06B6D4",
		description: null,
	},
	// Mistake tags
	{
		name: "FOMO",
		type: "mistake",
		color: "#3B82F6",
		description: null,
	},
	{
		name: "Noticia",
		type: "mistake",
		color: "#F59E0B",
		description: null,
	},
	{
		name: "Overtrading",
		type: "mistake",
		color: "#10B981",
		description: null,
	},
	{
		name: "Pelo Celular",
		type: "mistake",
		color: "#8B5CF6",
		description: null,
	},
	{
		name: "Fora Operacional",
		type: "mistake",
		color: "#EF4444",
		description: null,
	},
]

/**
 * Seeds default strategies and tags for a newly registered user.
 * Silently skips on error to avoid blocking registration.
 */
const seedUserData = async (userId: string): Promise<void> => {
	try {
		const strategyValues = DEFAULT_STRATEGIES.map((s) => ({ userId, ...s }))
		const tagValues = DEFAULT_TAGS.map((t) => ({ userId, ...t }))

		await Promise.all([
			db.insert(strategies).values(strategyValues),
			db.insert(tags).values(tagValues),
		])
	} catch (error) {
		// Log but don't throw — seed failure shouldn't block registration
		console.error("Failed to seed user data:", error)
	}
}

export { seedUserData, DEFAULT_STRATEGIES, DEFAULT_TAGS }
