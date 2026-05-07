/**
 * Color utility functions for KPI cards.
 * Centralizes the logic for mapping numeric values to semantic color classes.
 */

/**
 * Determines the color class for a numeric value based on positive/negative state.
 *
 * @param value - The numeric value to evaluate
 * @returns The appropriate Tailwind color class
 */
const getValueColorClass = (value: number | null | undefined): string => {
	if (value === null || value === undefined) {
		return "text-txt-100"
	}
	if (value > 0) {
		return "text-trade-buy"
	}
	if (value < 0) {
		return "text-trade-sell"
	}
	return "text-txt-100"
}

/**
 * Determines color class based on whether a value meets a threshold.
 * Green if above, red if below, neutral at exactly the threshold.
 *
 * @param value - The numeric value to evaluate
 * @param threshold - The threshold to compare against
 * @returns The appropriate Tailwind color class
 */
const getThresholdColorClass = (
	value: number | null | undefined,
	threshold: number
): string => {
	if (value === null || value === undefined) {
		return "text-txt-100"
	}
	if (value > threshold) {
		return "text-trade-buy"
	}
	if (value < threshold) {
		return "text-trade-sell"
	}
	return "text-txt-100"
}

export { getValueColorClass, getThresholdColorClass }
