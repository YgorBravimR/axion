/**
 * Categorical chart color palette helper.
 * Returns CSS variable references for chart series, cycling on overflow.
 * Maps: 1→chart-1, 2→chart-2, ..., 7→chart-7, 8→chart-1, etc.
 */
export function getChartColor(index: number): string {
	const chartIndex = ((index - 1) % 7) + 1
	return `var(--color-chart-${chartIndex})`
}
