import { db } from "@/db/drizzle"
import { strategies, tags, timeframes } from "@/db/schema"
import { eq } from "drizzle-orm"

/**
 * Strips emoji characters from a string for fuzzy comparison.
 *
 * @param str - The input string potentially containing emojis
 * @returns The string with all emoji characters removed and trimmed
 */
const stripEmojis = (str: string): string =>
	str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").trim()

/**
 * 3-tier fuzzy match: exact (case-insensitive) → emoji-stripped → contains.
 *
 * @param query - The search query string
 * @param candidates - Array of candidates with id and name to match against
 * @returns The matched candidate's id, or null if no match found
 */
const fuzzyMatch = (
	query: string,
	candidates: Array<{ id: string; name: string }>
): string | null => {
	const queryLower = query.toLowerCase()
	const queryStripped = stripEmojis(query).toLowerCase()

	// Tier 1: Exact match (case-insensitive)
	for (const candidate of candidates) {
		if (candidate.name.toLowerCase() === queryLower) {
			return candidate.id
		}
	}

	// Tier 2: Emoji-stripped match (case-insensitive)
	for (const candidate of candidates) {
		if (stripEmojis(candidate.name).toLowerCase() === queryStripped) {
			return candidate.id
		}
	}

	// Tier 3: Contains match (case-insensitive)
	for (const candidate of candidates) {
		if (candidate.name.toLowerCase().includes(queryLower)) {
			return candidate.id
		}
	}

	return null
}

/**
 * Resolves a strategy name to its UUID using 3-tier fuzzy matching.
 * Strategies are scoped to the given userId.
 *
 * @param name - The strategy name to resolve
 * @param userId - The user ID to scope the search
 * @returns The strategy UUID, or null if not found
 */
const resolveStrategyName = async (
	name: string,
	userId: string
): Promise<string | null> => {
	const rows = await db
		.select({ id: strategies.id, name: strategies.name })
		.from(strategies)
		.where(eq(strategies.userId, userId))

	return fuzzyMatch(name, rows)
}

/**
 * Resolves a tag name to its UUID using 3-tier fuzzy matching.
 * Tags are scoped to the given userId.
 *
 * @param name - The tag name to resolve
 * @param userId - The user ID to scope the search
 * @returns The tag UUID, or null if not found
 */
const resolveTagName = async (
	name: string,
	userId: string
): Promise<string | null> => {
	const rows = await db
		.select({ id: tags.id, name: tags.name })
		.from(tags)
		.where(eq(tags.userId, userId))

	return fuzzyMatch(name, rows)
}

/**
 * Resolves an array of tag names to their UUIDs. Returns only successfully resolved IDs.
 *
 * @param names - Array of tag names to resolve
 * @param userId - The user ID to scope the search
 * @returns Array of resolved tag UUIDs (unresolved names are silently dropped)
 */
const resolveTagNames = async (
	names: string[],
	userId: string
): Promise<string[]> => {
	if (names.length === 0) return []

	const rows = await db
		.select({ id: tags.id, name: tags.name })
		.from(tags)
		.where(eq(tags.userId, userId))

	const resolvedIds: string[] = []

	for (const name of names) {
		const matchId = fuzzyMatch(name, rows)
		if (matchId) {
			resolvedIds.push(matchId)
		}
	}

	return resolvedIds
}

/**
 * Resolves a timeframe name to its UUID using 3-tier fuzzy matching.
 * Timeframes are global (not scoped to any user).
 *
 * @param name - The timeframe name to resolve
 * @returns The timeframe UUID, or null if not found
 */
const resolveTimeframeName = async (name: string): Promise<string | null> => {
	const rows = await db
		.select({ id: timeframes.id, name: timeframes.name })
		.from(timeframes)

	return fuzzyMatch(name, rows)
}

export { resolveStrategyName, resolveTagName, resolveTagNames, resolveTimeframeName }
