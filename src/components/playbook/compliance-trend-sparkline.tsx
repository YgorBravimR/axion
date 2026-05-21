import { getTranslations } from "next-intl/server"
import { cn } from "@/lib/utils"
import type { ComplianceTrendPoint } from "@/app/actions/strategy-compliance-trend.types"

interface ComplianceTrendSparklineProps {
	points: ComplianceTrendPoint[]
}

export const ComplianceTrendSparkline = async ({
	points,
}: ComplianceTrendSparklineProps) => {
	const t = await getTranslations("playbook.complianceTrend")

	if (points.length === 0) {
		return <div className="text-tiny text-txt-300">{t("emptyState")}</div>
	}

	// Filter to points with tracked trades
	const validPoints = points.filter((p) => p.trackedCount > 0)

	if (validPoints.length === 0) {
		return <div className="text-tiny text-txt-300">{t("emptyState")}</div>
	}

	// Determine last 4 weeks avg for tone
	const last4Weeks = validPoints.slice(-4)
	const last4WeeksAvg =
		last4Weeks.length > 0
			? last4Weeks.reduce((sum, p) => sum + p.compliance, 0) / last4Weeks.length
			: 0

	// Determine color based on last 4 weeks avg
	const trendTone =
		last4WeeksAvg >= 75
			? "text-trade-buy"
			: last4WeeksAvg >= 40
				? "text-warning"
				: "text-trade-sell"

	// SVG dimensions
	const width = 200
	const height = 40
	const padding = 4
	const innerWidth = width - padding * 2
	const innerHeight = height - padding * 2

	// Data scaling
	const minCompliance = 0
	const maxCompliance = 100
	const dataRange = maxCompliance - minCompliance

	// Generate path points
	const points_scaled = validPoints.map((point, idx) => {
		const x = padding + (idx / (validPoints.length - 1)) * innerWidth
		const y =
			padding +
			innerHeight -
			((point.compliance - minCompliance) / dataRange) * innerHeight
		return { x, y, point }
	})

	// Build path data
	const pathData = points_scaled
		.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
		.join(" ")

	return (
		<div className="gap-s-200 flex flex-col">
			<svg
				viewBox={`0 0 ${width} ${height}`}
				width={width}
				height={height}
				className={cn("stroke-current stroke-1", trendTone)}
				style={{ fill: "none" }}
			>
				{/* Line path */}
				<path d={pathData} vectorEffect="non-scaling-stroke" />

				{/* Data point markers with tooltips */}
				{points_scaled.map((p) => (
					<circle
						key={`marker-${p.point.weekStart}`}
						cx={p.x}
						cy={p.y}
						r="1.5"
						className={cn("stroke-current", trendTone)}
						style={{ fill: "currentColor" }}
					>
						<title>
							{t("tooltipFormat", {
								week: p.point.weekStart,
								compliance: Math.round(p.point.compliance),
								followed: p.point.followedCount,
								tracked: p.point.trackedCount,
							})}
						</title>
					</circle>
				))}
			</svg>

			{/* Last 4 weeks summary */}
			<div className={cn("text-tiny font-semibold", trendTone)}>
				{t("last4WeeksAvg", {
					pct: Math.round(last4WeeksAvg),
				})}
			</div>
		</div>
	)
}
