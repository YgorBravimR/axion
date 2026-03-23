/**
 * Cache tag builders for "use cache" invalidation.
 *
 * Tags are coarse-grained by design: any trade mutation for a user+account
 * invalidates ALL cached analytics for that combination. This is intentionally
 * aggressive — safety over efficiency.
 */

/** All trade-derived analytics for a specific account */
const tradeTag = (userId: string, accountId: string) =>
	`trades:${userId}:${accountId}`

/** All trade-derived analytics across all accounts ("show all" mode) */
const tradeAllTag = (userId: string) => `trades:${userId}:all`

/** Strategy-derived data */
const strategyTag = (userId: string, accountId: string) =>
	`strategies:${userId}:${accountId}`

/** Tag-derived data */
const tagTag = (userId: string, accountId: string) =>
	`tags:${userId}:${accountId}`

/** User settings */
const settingsTag = (userId: string) => `settings:${userId}`

export { tradeTag, tradeAllTag, strategyTag, tagTag, settingsTag }
