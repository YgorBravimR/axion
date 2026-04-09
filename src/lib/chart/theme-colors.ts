/**
 * Reads Axion CSS custom property values from the DOM at runtime.
 * Lightweight Charts can't read CSS variables directly — it needs raw color strings.
 * This resolves them at chart creation time, respecting the active theme + light/dark mode.
 */

const getCssVar = (name: string): string => {
	if (typeof window === "undefined") return ""
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Resolve all chart-relevant colors from the active Axion theme */
const getChartThemeColors = () => ({
	// Backgrounds & text
	bg100: getCssVar("--color-bg-100"),
	bg200: getCssVar("--color-bg-200"),
	bg300: getCssVar("--color-bg-300"),
	txt100: getCssVar("--color-txt-100"),
	txt200: getCssVar("--color-txt-200"),
	txt300: getCssVar("--color-txt-300"),
	txtPlaceholder: getCssVar("--color-txt-placeholder"),

	// Accent
	acc100: getCssVar("--color-acc-100"),
	acc200: getCssVar("--color-acc-200"),

	// Trading colors (candles, TP/SL, profit/loss)
	tradeBuy: getCssVar("--color-trade-buy"),
	tradeSell: getCssVar("--color-trade-sell"),
	tradeBuyMuted: getCssVar("--color-trade-buy-muted"),
	tradeSellMuted: getCssVar("--color-trade-sell-muted"),

	// Action colors (execution markers — entries/exits)
	actionBuy: getCssVar("--color-action-buy"),
	actionSell: getCssVar("--color-action-sell"),

	// Feedback
	fbError: getCssVar("--color-fb-error"),
	fbSuccess: getCssVar("--color-fb-success"),
})

type ChartThemeColors = ReturnType<typeof getChartThemeColors>

export type { ChartThemeColors }
export { getChartThemeColors }
