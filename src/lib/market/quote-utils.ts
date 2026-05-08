/**
 * Shared quote formatting utilities.
 *
 * Centralizes display logic used by quote-row and hero-quote-card
 * so there's a single source of truth for price/change formatting.
 */

/** If the last data point is older than 30 min, consider the market closed */
export const STALE_THRESHOLD_MS = 30 * 60 * 1000

export const isQuoteStale = (updatedAt: string): boolean =>
	Date.now() - new Date(updatedAt).getTime() > STALE_THRESHOLD_MS

export const formatPrice = (price: number): string => {
	if (price >= 1000) {
		return price.toLocaleString("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})
	}
	if (price >= 1) {
		return price.toLocaleString("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 4,
		})
	}
	return price.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 6,
	})
}

export const formatChange = (change: number): string => {
	const sign = change >= 0 ? "+" : ""
	return `${sign}${change.toFixed(2)}`
}

export const formatChangePercent = (percent: number): string => {
	const sign = percent >= 0 ? "+" : ""
	return `${sign}${percent.toFixed(2)}%`
}
