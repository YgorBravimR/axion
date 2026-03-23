/**
 * Module-level analytics cache that persists across component mount/unmount cycles.
 *
 * This cache lives in the client bundle only. It survives navigations between pages
 * (SPA transitions) but is cleared when:
 *   1. The SSR sends fresh initialDashboard props (after revalidatePath from mutations)
 *   2. The 5-minute TTL expires
 *
 * The server cannot directly clear this cache. Instead, mutations call revalidatePath
 * which triggers fresh SSR on the next visit, delivering new initialDashboard props,
 * which triggers the reset effect in analytics-content.tsx that calls clearAnalyticsCache().
 */

import type { AnalyticsDashboardData, TagStats } from "@/types"

interface AnalyticsCacheEntry {
	dashboard: AnalyticsDashboardData
	tags: TagStats[]
	timestamp: number
}

/** Module-level Map -- survives component mount/unmount cycles */
const cache = new Map<string, AnalyticsCacheEntry>()

/** Maximum age before auto-expiry (5 minutes) */
const MAX_AGE_MS = 5 * 60 * 1000

const getAnalyticsCacheEntry = (
	filterKey: string
): AnalyticsCacheEntry | null => {
	const entry = cache.get(filterKey)
	if (!entry) return null

	if (Date.now() - entry.timestamp > MAX_AGE_MS) {
		cache.delete(filterKey)
		return null
	}

	return entry
}

const setAnalyticsCacheEntry = (
	filterKey: string,
	dashboard: AnalyticsDashboardData,
	tags: TagStats[]
): void => {
	cache.set(filterKey, { dashboard, tags, timestamp: Date.now() })
}

/** Call when SSR delivers fresh data (after mutations trigger revalidatePath) */
const clearAnalyticsCache = (): void => {
	cache.clear()
}

const getAnalyticsCacheSize = (): number => cache.size

export {
	getAnalyticsCacheEntry,
	setAnalyticsCacheEntry,
	clearAnalyticsCache,
	getAnalyticsCacheSize,
}
