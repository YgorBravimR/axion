import { useIsMobile } from "@/hooks/use-is-mobile"

interface ChartConfig {
	yAxisWidth: number
	tickFontSize: number
}

/**
 * Returns responsive chart configuration values based on viewport size.
 *
 * @returns yAxisWidth — 35px on mobile, 65px on desktop
 * @returns tickFontSize — 10px on mobile, 12px on desktop
 */
const useChartConfig = (): ChartConfig => {
	const isMobile = useIsMobile()

	return {
		yAxisWidth: isMobile ? 35 : 65,
		tickFontSize: isMobile ? 10 : 12,
	}
}

export { useChartConfig }
