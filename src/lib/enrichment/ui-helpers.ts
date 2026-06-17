/**
 * UI helper functions for enrichment review components.
 * Formats timestamps and provides status icons for the review sidebar and cards.
 */

/**
 * Format a date/timestamp for the review sidebar.
 * Converts to HH:mm format.
 */
export const formatTimeForReview = (
	date: Date | string | undefined
): string => {
	if (!date) {
		return ""
	}

	const d = typeof date === "string" ? new Date(date) : date
	const hours = String(d.getHours()).padStart(2, "0")
	const minutes = String(d.getMinutes()).padStart(2, "0")
	return `${hours}:${minutes}`
}

/**
 * Get the status icon for a snapshot in the sidebar.
 * - "current" (►): actively being reviewed
 * - "committed" (✓): already saved
 * - "skipped" (⊘): skipped during review
 * - "draft" (•): not yet visited
 */
export const getStatusIcon = (
	status: "current" | "committed" | "skipped" | "abandoned" | "draft"
): string => {
	switch (status) {
		case "current":
			return "►"
		case "committed":
			return "✓"
		case "skipped":
		case "abandoned":
			return "⊘"
		case "draft":
		default:
			return "•"
	}
}

/**
 * Format a field name for display in the review card.
 * Converts camelCase to Title Case.
 */
export const formatFieldName = (fieldName: string): string => {
	return fieldName
		.replace(/([A-Z])/g, " $1")
		.replace(/^./, (c) => c.toUpperCase())
		.trim()
}

/**
 * Format a field value for display.
 * Handles null, undefined, numbers, booleans, and objects.
 */
export const formatFieldValue = (value: unknown): string => {
	if (value === null || value === undefined) {
		return "(null)"
	}
	if (typeof value === "boolean") {
		return value ? "True" : "False"
	}
	if (typeof value === "number") {
		// Format large numbers with thousand separators
		if (Math.abs(value) >= 1000) {
			return value.toLocaleString("pt-BR", {
				maximumFractionDigits: 2,
				minimumFractionDigits: 0,
			})
		}
		// Format decimals with 2 places
		return value.toFixed(2)
	}
	if (typeof value === "object") {
		return JSON.stringify(value)
	}
	// eslint-disable-next-line @typescript-eslint/no-base-to-string
	return String(value)
}
