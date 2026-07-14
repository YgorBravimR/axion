import type {
	IChartApi,
	ISeriesApi,
	IPrimitivePaneView,
	IPrimitivePaneRenderer,
	SeriesType,
	UTCTimestamp,
} from "lightweight-charts"
import { HAWKS_PALETTE } from "@/lib/chart/hawks-palette"

// The draw target type lives in `fancy-canvas`, a transitive dep of
// lightweight-charts that isn't hoisted to the top level — importing it by name
// fails module resolution. Derive it straight from LWC's own renderer contract.
type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0]

export interface BoundaryMarker {
	readonly brickIdx: number
	readonly kind: "day" | "week"
}

/**
 * Vertical-line renderer for session boundary markers (day/week).
 * Draws full-pane-height lines at specified brick indices, positioned behind candles.
 * Day lines are thin and faint; week lines are bolder.
 */
class VerticalLinesRenderer implements IPrimitivePaneRenderer {
	private readonly markers: ReadonlyArray<BoundaryMarker>
	private readonly chart: IChartApi

	constructor(markers: ReadonlyArray<BoundaryMarker>, chart: IChartApi) {
		this.markers = markers
		this.chart = chart
	}

	draw(target: DrawTarget): void {
		const timeScale = this.chart.timeScale()

		target.useBitmapCoordinateSpace((scope) => {
			const bitmapSize = scope.bitmapSize

			for (const marker of this.markers) {
				// Renko x-axis uses the brick index as the time value (0, 1, 2, …).
				const x = timeScale.timeToCoordinate(marker.brickIdx as UTCTimestamp)
				if (x === null) {
					continue // off-screen
				}

				const isWeek = marker.kind === "week"
				const color = isWeek
					? HAWKS_PALETTE.boundary.week
					: HAWKS_PALETTE.boundary.day
				const lineWidth = isWeek ? 2 : 1

				// Scale coordinates to bitmap space
				const bitmapX = Math.round(x * scope.horizontalPixelRatio)
				const scaledLineWidth = Math.round(
					lineWidth * scope.horizontalPixelRatio
				)

				// Draw full-pane-height vertical line
				scope.context.fillStyle = color
				scope.context.fillRect(
					bitmapX - Math.round(scaledLineWidth / 2),
					0,
					scaledLineWidth,
					bitmapSize.height
				)
			}
		})
	}
}

/**
 * Pane view wrapper for the vertical-lines renderer.
 * Positions the primitive at the bottom of the visual stack so it renders behind candles and indicators.
 */
class VerticalLinesPaneView implements IPrimitivePaneView {
	constructor(private readonly _renderer: VerticalLinesRenderer) {}

	zOrder(): "bottom" | "normal" | "top" {
		return "bottom"
	}

	renderer(): IPrimitivePaneRenderer {
		return this._renderer
	}
}

/**
 * Series primitive that draws vertical lines at brick indices for day/week session boundaries.
 * Integrates with LWC 5's ISeriesPrimitive interface via paneViews() lifecycle.
 */
export class VerticalLinesPrimitive {
	private markers: ReadonlyArray<BoundaryMarker> = []
	private chart: IChartApi | null = null
	private requestUpdate: (() => void) | null = null

	// ISeriesPrimitive lifecycle hook — called when attached to a series.
	attached(param: {
		chart: IChartApi
		series: ISeriesApi<SeriesType>
		requestUpdate: () => void
	}): void {
		this.chart = param.chart
		this.requestUpdate = param.requestUpdate
	}

	// ISeriesPrimitive lifecycle hook — called when detached from a series.
	detached(): void {
		this.chart = null
		this.requestUpdate = null
	}

	setMarkers(markers: ReadonlyArray<BoundaryMarker>): void {
		this.markers = markers
		this.requestUpdate?.()
	}

	paneViews(): readonly IPrimitivePaneView[] {
		if (!this.chart || this.markers.length === 0) {
			return []
		}
		const renderer = new VerticalLinesRenderer(this.markers, this.chart)
		return [new VerticalLinesPaneView(renderer)]
	}
}
