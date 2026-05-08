/**
 * Simple in-memory TTL cache for market data.
 * Avoids hammering external APIs on every request.
 */

interface CacheEntry<T> {
	data: T
	expiresAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()

export const CACHE_KEYS = {
	QUOTES: "market:quotes",
	CALENDAR: "market:calendar",
} as const

export const CACHE_TTL = {
	QUOTES: 60_000, // 60 seconds
	CALENDAR: 300_000, // 5 minutes
} as const

export const cacheGet = <T>(key: string): T | null => {
	const entry = cache.get(key) as CacheEntry<T> | undefined
	if (!entry) {
		return null
	}
	if (Date.now() > entry.expiresAt) {
		cache.delete(key)
		return null
	}
	return entry.data
}

export const cacheSet = <T>(key: string, data: T, ttlMs: number): void => {
	cache.set(key, {
		data,
		expiresAt: Date.now() + ttlMs,
	})
}
