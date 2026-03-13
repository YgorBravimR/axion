"use client"

import { useTranslations } from "next-intl"
import { AlertTriangle, Info, CheckCircle } from "lucide-react"
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { SimulationStatistics } from "@/types/monte-carlo"

interface KellyCriterionCardProps {
	statistics: SimulationStatistics
}

const formatKellyPercent = (value: number): string => `${value.toFixed(2)}%`

const formatKellyCurrency = (value: number, symbol = "$"): string =>
	`${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export const KellyCriterionCard = ({ statistics }: KellyCriterionCardProps) => {
	const t = useTranslations("monteCarlo.metrics")
	const tTooltips = useTranslations("monteCarlo.tooltips")

	const {
		kellyFull,
		kellyHalf,
		kellyQuarter,
		kellyRecommendation,
		kellyLevel,
	} = statistics

	const levelConfig = {
		aggressive: {
			Icon: AlertTriangle,
			color: "text-fb-warning",
			bgColor: "bg-fb-warning/10 border-fb-warning/30",
		},
		balanced: {
			Icon: Info,
			color: "text-accent-primary",
			bgColor: "bg-accent-primary/10 border-accent-primary/30",
		},
		conservative: {
			Icon: CheckCircle,
			color: "text-trade-buy",
			bgColor: "bg-trade-buy/10 border-trade-buy/30",
		},
	}

	const {
		Icon: LevelIcon,
		color: levelColor,
		bgColor: levelBgColor,
	} = levelConfig[kellyLevel]

	const recommendedKellyConfig = {
		aggressive: {
			value: kellyFull,
			label: t("fullKelly"),
		},
		balanced: {
			value: kellyHalf,
			label: t("halfKelly"),
		},
		conservative: {
			value: kellyQuarter,
			label: t("quarterKelly"),
		},
	}

	const { value: recommendedKelly, label: recommendedKellyLabel } =
		recommendedKellyConfig[kellyLevel]

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
			<div className="mb-m-400 flex items-start justify-between">
				<div>
					<div className="gap-s-200 flex items-center">
						<h3 className="text-small sm:text-body text-txt-100 font-semibold">
							{t("kelly")}
						</h3>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="cursor-help">
									<Info className="text-txt-300 h-3.5 w-3.5" />
								</span>
							</TooltipTrigger>
							<TooltipContent
								id="tooltip-kelly-criterion"
								side="top"
								className="border-bg-300 bg-bg-100 text-txt-200 p-s-300 max-w-xs border shadow-lg"
							>
								<p className="text-tiny leading-relaxed">
									{tTooltips("kellyCriterion")}
								</p>
							</TooltipContent>
						</Tooltip>
					</div>
					<p className="mt-s-100 text-tiny text-txt-300">
						{t("kellyDescription")}
					</p>
				</div>
			</div>

			{/* Kelly Values */}
			<div className="mb-m-400 gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-3">
				<div
					className={cn(
						"p-s-200 sm:p-s-300 rounded-lg border text-center",
						kellyLevel === "conservative"
							? levelBgColor
							: "border-bg-300 bg-bg-100"
					)}
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<p className="gap-s-100 text-tiny text-txt-300 inline-flex cursor-help items-center justify-center">
								{t("quarterKelly")}
								<Info className="h-3 w-3" />
							</p>
						</TooltipTrigger>
						<TooltipContent
							id="tooltip-kelly-quarter"
							side="top"
							className="border-bg-300 bg-bg-100 text-txt-200 p-s-300 max-w-xs border shadow-lg"
						>
							<p className="text-tiny leading-relaxed">
								{tTooltips("kellyQuarter")}
							</p>
						</TooltipContent>
					</Tooltip>
					<p className="text-h4 text-txt-100 font-bold">
						{formatKellyPercent(kellyQuarter)}
					</p>
				</div>
				<div
					className={cn(
						"p-s-200 sm:p-s-300 rounded-lg border text-center",
						kellyLevel === "balanced" ? levelBgColor : "border-bg-300 bg-bg-100"
					)}
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<p className="gap-s-100 text-tiny text-txt-300 inline-flex cursor-help items-center justify-center">
								{t("halfKelly")}
								<Info className="h-3 w-3" />
							</p>
						</TooltipTrigger>
						<TooltipContent
							id="tooltip-kelly-half"
							side="top"
							className="border-bg-300 bg-bg-100 text-txt-200 p-s-300 max-w-xs border shadow-lg"
						>
							<p className="text-tiny leading-relaxed">
								{tTooltips("kellyHalf")}
							</p>
						</TooltipContent>
					</Tooltip>
					<p className="text-h4 text-txt-100 font-bold">
						{formatKellyPercent(kellyHalf)}
					</p>
				</div>
				<div
					className={cn(
						"p-s-200 sm:p-s-300 rounded-lg border text-center",
						kellyLevel === "aggressive"
							? levelBgColor
							: "border-bg-300 bg-bg-100"
					)}
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<p className="gap-s-100 text-tiny text-txt-300 inline-flex cursor-help items-center justify-center">
								{t("fullKelly")}
								<Info className="h-3 w-3" />
							</p>
						</TooltipTrigger>
						<TooltipContent
							id="tooltip-kelly-full"
							side="top"
							className="border-bg-300 bg-bg-100 text-txt-200 p-s-300 max-w-xs border shadow-lg"
						>
							<p className="text-tiny leading-relaxed">
								{tTooltips("kellyFull")}
							</p>
						</TooltipContent>
					</Tooltip>
					<p className="text-h4 text-txt-100 font-bold">
						{formatKellyPercent(kellyFull)}
					</p>
				</div>
			</div>

			{/* Recommendation */}
			<div className={cn("p-s-200 sm:p-s-300 rounded-lg border", levelBgColor)}>
				<div className="gap-s-200 flex items-start">
					<LevelIcon
						className={cn("mt-0.5 h-4 w-4 flex-shrink-0", levelColor)}
					/>
					<p className="text-small text-txt-100">{kellyRecommendation}</p>
				</div>
			</div>

			{/* Position Size Examples */}
			<div className="mt-m-400 border-bg-300 pt-m-400 border-t">
				<p className="mb-s-200 text-tiny text-txt-200 font-medium">
					{t("recommendedPositionSizes", { kellyType: recommendedKellyLabel })}
				</p>
				<div className="space-y-s-100 text-tiny text-txt-300">
					<p>
						•{" "}
						{t("accountRisk", {
							account: formatKellyCurrency(10000),
							risk: formatKellyCurrency((recommendedKelly / 100) * 10000),
						})}
					</p>
					<p>
						•{" "}
						{t("accountRisk", {
							account: formatKellyCurrency(25000),
							risk: formatKellyCurrency((recommendedKelly / 100) * 25000),
						})}
					</p>
					<p>
						•{" "}
						{t("accountRisk", {
							account: formatKellyCurrency(50000),
							risk: formatKellyCurrency((recommendedKelly / 100) * 50000),
						})}
					</p>
				</div>
			</div>
		</div>
	)
}
