"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { useFormatting } from "@/hooks/use-formatting"
import { StatCard, type StatCardProps } from "@/components/shared"
import { cn } from "@/lib/utils"
import type { EquityPoint } from "@/types"
import { getValueColorClass } from "./helpers"

interface PnlCardProps {
	grossPnl: number | null
	equityCurve?: EquityPoint[]
	size?: StatCardProps["size"]
	className?: string
}

const SPARKLINE_WIDTH = 120
const SPARKLINE_HEIGHT = 32
const SPARKLINE_PAD = 2

interface PnlSparklineProps {
	points: number[]
	tone: "buy" | "sell" | "neutral"
}

const toneToStrokeClass: Record<PnlSparklineProps["tone"], string> = {
	buy: "text-trade-buy",
	sell: "text-trade-sell",
	neutral: "text-txt-300",
}

const PnlSparkline = ({ points, tone }: PnlSparklineProps) => {
	const { pathD, areaD } = useMemo(() => {
		if (points.length < 2) {
			return { pathD: "", areaD: "" }
		}
		const innerW = SPARKLINE_WIDTH - SPARKLINE_PAD * 2
		const innerH = SPARKLINE_HEIGHT - SPARKLINE_PAD * 2
		const min = Math.min(...points)
		const max = Math.max(...points)
		const range = max - min || 1
		const xy = points.map((v, i) => {
			const x = SPARKLINE_PAD + (i / (points.length - 1)) * innerW
			const y = SPARKLINE_PAD + innerH - ((v - min) / range) * innerH
			return { x, y }
		})
		const line = xy
			.map(
				(p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
			)
			.join(" ")
		const baselineY = SPARKLINE_HEIGHT - SPARKLINE_PAD
		const firstX = xy[0]!.x.toFixed(2)
		const lastX = xy[xy.length - 1]!.x.toFixed(2)
		const area = `${line} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`
		return { pathD: line, areaD: area }
	}, [points])

	if (!pathD) {
		return null
	}

	return (
		<svg
			viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
			width={SPARKLINE_WIDTH}
			height={SPARKLINE_HEIGHT}
			className={cn("shrink-0", toneToStrokeClass[tone])}
			aria-hidden="true"
			preserveAspectRatio="none"
		>
			<path d={areaD} fill="currentColor" opacity={0.12} />
			<path
				d={pathD}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				strokeLinejoin="round"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	)
}

const PnlCard = ({
	grossPnl,
	equityCurve,
	size = "md",
	className,
}: PnlCardProps) => {
	const t = useTranslations("dashboard.kpi")
	const { formatCompactCurrency } = useFormatting()
	const grossColor = getValueColorClass(grossPnl)

	const sparkPoints = useMemo<number[]>(() => {
		if (!equityCurve || equityCurve.length < 2) {
			return []
		}
		const tail = equityCurve.slice(-30)
		return tail.map((p) => p.equity)
	}, [equityCurve])

	const tone: PnlSparklineProps["tone"] =
		grossPnl !== null && grossPnl > 0
			? "buy"
			: grossPnl !== null && grossPnl < 0
				? "sell"
				: "neutral"

	return (
		<StatCard
			label={t("pnl")}
			value={grossPnl !== null ? formatCompactCurrency(grossPnl) : "--"}
			valueColorClass={grossColor}
			indicator={
				sparkPoints.length >= 2 ? (
					<PnlSparkline points={sparkPoints} tone={tone} />
				) : undefined
			}
			size={size}
			className={className}
		/>
	)
}

export { PnlCard }
