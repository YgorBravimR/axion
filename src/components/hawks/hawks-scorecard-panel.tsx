import { getTranslations } from "next-intl/server"
import { Crosshair, ShieldAlert, BarChart2, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { getHawksScorecardForMonth } from "@/lib/hawks/scorecard"

interface HawksScorecardPanelProps {
	accountId: string
	year: number
	month: number
}

const getScoreColor = (rate: number): string => {
	if (rate >= 0.8) {
		return "text-profit"
	}
	if (rate >= 0.6) {
		return "text-warning"
	}
	return "text-destructive"
}

const getScoreBg = (rate: number): string => {
	if (rate >= 0.8) {
		return "bg-profit/10"
	}
	if (rate >= 0.6) {
		return "bg-warning/10"
	}
	return "bg-destructive/10"
}

const getViolationColor = (count: number): string => {
	if (count === 0) {
		return "text-profit"
	}
	if (count <= 2) {
		return "text-warning"
	}
	return "text-destructive"
}

const getViolationBg = (count: number): string => {
	if (count === 0) {
		return "bg-profit/10"
	}
	if (count <= 2) {
		return "bg-warning/10"
	}
	return "bg-destructive/10"
}

const getOverTradeBg = (days: number): string => {
	if (days === 0) {
		return "bg-profit/10"
	}
	if (days <= 3) {
		return "bg-warning/10"
	}
	return "bg-destructive/10"
}

const getOverTradeColor = (days: number): string => {
	if (days === 0) {
		return "text-profit"
	}
	if (days <= 3) {
		return "text-warning"
	}
	return "text-destructive"
}

const HawksScorecardPanel = async ({
	accountId,
	year,
	month,
}: HawksScorecardPanelProps) => {
	const scorecard = await getHawksScorecardForMonth(accountId, year, month)
	if (!scorecard) {
		return null
	}

	const t = await getTranslations("hawks.scorecard")

	const {
		tripleScreenRate,
		biasAlignmentRate,
		stopViolationCount,
		overTradeDays,
		totalHawksTrades,
		methodologyScore,
	} = scorecard

	const methodPct = Math.round(methodologyScore * 100)
	const tripleScreenPct = Math.round(tripleScreenRate * 100)
	const biasPct = Math.round(biasAlignmentRate * 100)

	return (
		<div className="border-bg-300 bg-bg-200 rounded-lg border">
			{/* Header */}
			<div className="border-bg-300 p-m-400 gap-s-300 flex items-center border-b">
				<Crosshair
					className="text-acc-100 h-5 w-5 shrink-0"
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1">
					<h3 className="text-body text-txt-100 font-semibold">{t("title")}</h3>
					<p className="text-tiny text-txt-300">
						{t("tradeCount", { count: totalHawksTrades })}
					</p>
				</div>
			</div>

			{totalHawksTrades === 0 ? (
				<div className="p-m-400 sm:p-m-500">
					<p className="text-small text-txt-300">{t("noTrades")}</p>
				</div>
			) : (
				<div className="p-m-400 sm:p-m-500 space-y-m-400">
					{/* Methodology score hero */}
					<div
						className={cn(
							"p-m-400 sm:p-m-500 rounded-lg text-center",
							getScoreBg(methodologyScore)
						)}
					>
						<p className="text-tiny text-txt-300 mb-s-100">
							{t("methodologyScore")}
						</p>
						<p
							className={cn(
								"font-mono text-4xl font-bold tabular-nums",
								getScoreColor(methodologyScore)
							)}
						>
							{methodPct}%
						</p>
					</div>

					{/* 4 stat cells — 2×2 on mobile, 1 row on desktop */}
					<div className="gap-m-400 grid grid-cols-2 lg:grid-cols-4">
						{/* Triple screen */}
						<div
							className={cn(
								"p-s-300 sm:p-m-400 rounded-lg",
								getScoreBg(tripleScreenRate)
							)}
						>
							<div className="gap-s-200 mb-s-100 flex items-center">
								<BarChart2
									className={cn(
										"h-3.5 w-3.5 shrink-0",
										getScoreColor(tripleScreenRate)
									)}
									aria-hidden="true"
								/>
								<p className="text-micro text-txt-300 truncate">
									{t("tripleScreen")}
								</p>
							</div>
							<p
								className={cn(
									"font-mono text-xl font-bold tabular-nums",
									getScoreColor(tripleScreenRate)
								)}
							>
								{tripleScreenPct}%
							</p>
						</div>

						{/* Bias alignment */}
						<div
							className={cn(
								"p-s-300 sm:p-m-400 rounded-lg",
								getScoreBg(biasAlignmentRate)
							)}
						>
							<div className="gap-s-200 mb-s-100 flex items-center">
								<Crosshair
									className={cn(
										"h-3.5 w-3.5 shrink-0",
										getScoreColor(biasAlignmentRate)
									)}
									aria-hidden="true"
								/>
								<p className="text-micro text-txt-300 truncate">
									{t("biasAlignment")}
								</p>
							</div>
							<p
								className={cn(
									"font-mono text-xl font-bold tabular-nums",
									getScoreColor(biasAlignmentRate)
								)}
							>
								{biasPct}%
							</p>
						</div>

						{/* Stop violations */}
						<div
							className={cn(
								"p-s-300 sm:p-m-400 rounded-lg",
								getViolationBg(stopViolationCount)
							)}
						>
							<div className="gap-s-200 mb-s-100 flex items-center">
								<ShieldAlert
									className={cn(
										"h-3.5 w-3.5 shrink-0",
										getViolationColor(stopViolationCount)
									)}
									aria-hidden="true"
								/>
								<p className="text-micro text-txt-300 truncate">
									{t("stopViolations")}
								</p>
							</div>
							<p
								className={cn(
									"font-mono text-xl font-bold tabular-nums",
									getViolationColor(stopViolationCount)
								)}
							>
								{stopViolationCount}
							</p>
						</div>

						{/* Over-trade days */}
						<div
							className={cn(
								"p-s-300 sm:p-m-400 rounded-lg",
								getOverTradeBg(overTradeDays)
							)}
						>
							<div className="gap-s-200 mb-s-100 flex items-center">
								<Calendar
									className={cn(
										"h-3.5 w-3.5 shrink-0",
										getOverTradeColor(overTradeDays)
									)}
									aria-hidden="true"
								/>
								<p className="text-micro text-txt-300 truncate">
									{t("overTradeDays")}
								</p>
							</div>
							<p
								className={cn(
									"font-mono text-xl font-bold tabular-nums",
									getOverTradeColor(overTradeDays)
								)}
							>
								{overTradeDays}
							</p>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export { HawksScorecardPanel }
