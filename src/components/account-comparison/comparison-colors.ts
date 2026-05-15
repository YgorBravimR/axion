/**
 * Cyclic color palette for account comparison charts and tables.
 * Sourced from the categorical chart color system (--color-chart-N).
 * Maps accounts in selection order to stable, distinct chart colors.
 */
const COMPARISON_COLORS = [
	"var(--color-chart-1)", // account 1
	"var(--color-chart-2)", // account 2
	"var(--color-chart-3)", // account 3
	"var(--color-chart-4)", // account 4
	"var(--color-chart-5)", // account 5
	"var(--color-chart-6)", // account 6
	"var(--color-chart-7)", // account 7
] as const

export { COMPARISON_COLORS }
