// Re-export shim — the drawings module was promoted out of the /dev sandbox
// to power the user-facing /hawks-chart route. Existing dev imports continue
// to resolve here. Prefer importing directly from "@/components/hawks-chart/drawings"
// in new code.

export type {
	Drawing,
	DrawingTool,
	HLineDrawing,
	ProjectedDrawings,
	ProjectedTrendline,
	TrendlineDrawing,
} from "@/components/hawks-chart/drawings"
export {
	floorBrickIdx,
	makeId,
	projectDrawingsForPane,
} from "@/components/hawks-chart/drawings"
