/**
 * In-memory sliding window rate limiter.
 *
 * Good enough for single-instance deployments (Vercel serverless, single VPS).
 * For multi-instance deployments, swap to @upstash/ratelimit with Redis.
 *
 * Each key (email, IP) maintains an array of timestamps. On each check,
 * expired timestamps are pruned and remaining count is compared against the limit.
 */

interface RateLimitEntry {
	timestamps: number[]
}

interface RateLimiterConfig {
	/** Maximum number of requests allowed within the window */
	maxAttempts: number
	/** Time window in milliseconds */
	windowMs: number
}

interface RateLimitResult {
	allowed: boolean
	remaining: number
	retryAfterMs: number
}

const createRateLimiter = (config: RateLimiterConfig) => {
	const store = new Map<string, RateLimitEntry>()

	// Periodic cleanup of expired entries to prevent memory leaks
	const CLEANUP_INTERVAL_MS = 60_000 // 1 minute
	let lastCleanup = Date.now()

	const cleanup = () => {
		const now = Date.now()
		if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
			return
		}
		lastCleanup = now

		for (const [key, entry] of store) {
			const validTimestamps = entry.timestamps.filter(
				(ts) => now - ts < config.windowMs
			)
			if (validTimestamps.length === 0) {
				store.delete(key)
			} else {
				entry.timestamps = validTimestamps
			}
		}
	}

	const check = (key: string): RateLimitResult => {
		cleanup()

		const now = Date.now()
		const entry = store.get(key)

		if (!entry) {
			store.set(key, { timestamps: [now] })
			return {
				allowed: true,
				remaining: config.maxAttempts - 1,
				retryAfterMs: 0,
			}
		}

		// Prune expired timestamps
		entry.timestamps = entry.timestamps.filter(
			(ts) => now - ts < config.windowMs
		)

		if (entry.timestamps.length >= config.maxAttempts) {
			const oldestTimestamp = entry.timestamps[0]
			const retryAfterMs = config.windowMs - (now - oldestTimestamp)
			return { allowed: false, remaining: 0, retryAfterMs }
		}

		entry.timestamps.push(now)
		return {
			allowed: true,
			remaining: config.maxAttempts - entry.timestamps.length,
			retryAfterMs: 0,
		}
	}

	const reset = (key: string): void => {
		store.delete(key)
	}

	return { check, reset }
}

export { createRateLimiter }
export type { RateLimiterConfig, RateLimitResult }
