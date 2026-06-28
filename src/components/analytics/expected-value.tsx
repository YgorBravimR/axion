"use client"

import { Calculator, TrendingUp, TrendingDown, Info } from "lucide-react"
import { useTranslations } from "next-intl"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ExpectedValueData } from "@/types"
import { formatCompactCurrencyWithSign, formatR } from "@/lib/formatting"
import type { ExpectancyMode } from "./expectancy-mode-toggle"
import { SAMPLE_THRESHOLDS, classifySample } from "@/lib/statistics"
import { SampleBadge } from "./sample-confidence"
import { AlertTriangle } from "lucide-react"

const StatLabel = ({ label, tooltip }: { label: string; tooltip: string }) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<p className="gap-s-100 text-tiny text-txt-300 inline-flex cursor-help items-center">
				{label}
				<Info className="h-3 w-3" aria-hidden="true" />
			</p>
		</TooltipTrigger>
		<TooltipContent
			id="tooltip-expected-value-stat"
			side="top"
			className="border-bg-300 bg-bg-100 text-txt-200 p-s-300 max-w-xs border shadow-lg"
		>
			{tooltip}
		</TooltipContent>
	</Tooltip>
)

interface ExpectedValueProps {
	data: ExpectedValueData | null
	mode: ExpectancyMode
}

const EdgeExpectancyDisplay = ({ data }: { data: ExpectedValueData }) => {
	const t = useTranslations("analytics.expectedValue")
	const isPositiveR = data.expectedR >= 0

	return (
		<>
			{/* Main R Display */}
			<div className="mt-m-400 sm:mt-m-500 flex items-center justify-center">
				<div className="text-center">
					<p className="text-tiny text-txt-300">{t("perTradeR")}</p>
					<div className="mt-s-200 gap-s-200 flex items-center justify-center">
						{isPositiveR ? (
							<TrendingUp
								className="text-trade-buy h-8 w-8"
								aria-hidden="true"
							/>
						) : (
							<TrendingDown
								className="text-trade-sell h-8 w-8"
								aria-hidden="true"
							/>
						)}
						<span
							className={`text-h2 font-bold ${
								isPositiveR ? "text-trade-buy" : "text-trade-sell"
							}`}
						>
							{formatR(data.expectedR)}
						</span>
					</div>
				</div>
			</div>

			{/* Breakdown */}
			<div className="mt-m-400 sm:mt-m-500 lg:mt-m-600 gap-s-300 sm:gap-m-400 grid grid-cols-2 md:grid-cols-4">
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel label={t("winRateLabel")} tooltip={t("winRateDesc")} />
					<p className="mt-s-100 text-small sm:text-body text-txt-100 font-bold">
						{data.winRate.toFixed(1)}%
					</p>
				</div>
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel label={t("avgWinR")} tooltip={t("avgWinRDesc")} />
					<p className="mt-s-100 text-small sm:text-body text-trade-buy font-bold">
						{formatR(data.avgWinR)}
					</p>
				</div>
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel label={t("avgLossR")} tooltip={t("avgLossRDesc")} />
					<p className="mt-s-100 text-small sm:text-body text-trade-sell font-bold">
						{formatR(-data.avgLossR)}
					</p>
				</div>
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel
						label={t("projectedR100")}
						tooltip={t("projectedR100Desc")}
					/>
					<p
						className={`mt-s-100 text-small sm:text-body font-bold ${
							data.projectedR100 >= 0 ? "text-trade-buy" : "text-trade-sell"
						}`}
					>
						{formatR(data.projectedR100)}
					</p>
				</div>
			</div>

			{/* Formula Explanation */}
			<div className="mt-m-400 sm:mt-m-500 bg-bg-100 p-s-300 sm:p-m-400 rounded-lg">
				<div className="gap-s-200 flex items-start">
					<Info
						className="mt-s-100 text-txt-300 h-4 w-4 shrink-0"
						aria-hidden="true"
					/>
					<div className="text-tiny text-txt-300">
						<p className="text-txt-200 font-medium">{t("formulaTitleR")}</p>
						<p className="mt-s-100">{t("formulaR")}</p>
						<p className="mt-s-200">
							EV(R) = ({data.winRate.toFixed(1)}% × {data.avgWinR.toFixed(2)}R)
							- ({(100 - data.winRate).toFixed(1)}% × {data.avgLossR.toFixed(2)}
							R)
						</p>
						<p className="mt-s-200">
							EV(R) = {((data.winRate / 100) * data.avgWinR).toFixed(2)}R -{" "}
							{(((100 - data.winRate) / 100) * data.avgLossR).toFixed(2)}R ={" "}
							<span
								className={isPositiveR ? "text-trade-buy" : "text-trade-sell"}
							>
								{formatR(data.expectedR)}
							</span>
						</p>
					</div>
				</div>
			</div>

			{/* Interpretation */}
			<div className="mt-m-400">
				<p className="text-small text-txt-200">
					{isPositiveR
						? t.rich("systemHasPositiveEdgeR", {
								positive: (chunks) => (
									<span className="text-trade-buy font-semibold">{chunks}</span>
								),
								amount: () => (
									<span className="text-trade-buy font-semibold">
										{formatR(data.expectedR)}
									</span>
								),
							})
						: t.rich("systemHasNegativeEdgeR", {
								negative: (chunks) => (
									<span className="text-trade-sell font-semibold">
										{chunks}
									</span>
								),
								amount: () => (
									<span className="text-trade-sell font-semibold">
										{formatR(Math.abs(data.expectedR))}
									</span>
								),
							})}
				</p>
			</div>
		</>
	)
}

const CapitalExpectancyDisplay = ({ data }: { data: ExpectedValueData }) => {
	const t = useTranslations("analytics.expectedValue")
	const isPositiveEV = data.expectedValue >= 0

	return (
		<>
			{/* Main EV Display */}
			<div className="mt-m-400 sm:mt-m-500 flex items-center justify-center">
				<div className="text-center">
					<p className="text-tiny text-txt-300">{t("perTrade")}</p>
					<div className="mt-s-200 gap-s-200 flex items-center justify-center">
						{isPositiveEV ? (
							<TrendingUp
								className="text-trade-buy h-8 w-8"
								aria-hidden="true"
							/>
						) : (
							<TrendingDown
								className="text-trade-sell h-8 w-8"
								aria-hidden="true"
							/>
						)}
						<span
							className={`text-h2 font-bold ${
								isPositiveEV ? "text-trade-buy" : "text-trade-sell"
							}`}
						>
							{formatCompactCurrencyWithSign(data.expectedValue, "BRL")}
						</span>
					</div>
				</div>
			</div>

			{/* Breakdown */}
			<div className="mt-m-400 sm:mt-m-500 lg:mt-m-600 gap-s-300 sm:gap-m-400 grid grid-cols-2 md:grid-cols-4">
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel label={t("winRateLabel")} tooltip={t("winRateDesc")} />
					<p className="mt-s-100 text-small sm:text-body text-txt-100 font-bold">
						{data.winRate.toFixed(1)}%
					</p>
				</div>
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel label={t("avgWinLabel")} tooltip={t("avgWinDesc")} />
					<p className="mt-s-100 text-small sm:text-body text-trade-buy font-bold">
						{formatCompactCurrencyWithSign(data.avgWin, "BRL")}
					</p>
				</div>
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel label={t("avgLossLabel")} tooltip={t("avgLossDesc")} />
					<p className="mt-s-100 text-small sm:text-body text-trade-sell font-bold">
						{formatCompactCurrencyWithSign(-data.avgLoss, "BRL")}
					</p>
				</div>
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel label={t("projection100")} tooltip={t("projectionDesc")} />
					<p
						className={`mt-s-100 text-small sm:text-body font-bold ${
							data.projectedPnl100 >= 0 ? "text-trade-buy" : "text-trade-sell"
						}`}
					>
						{formatCompactCurrencyWithSign(data.projectedPnl100, "BRL")}
					</p>
				</div>
			</div>

			{/* Formula Explanation */}
			<div className="mt-m-400 sm:mt-m-500 bg-bg-100 p-s-300 sm:p-m-400 rounded-lg">
				<div className="gap-s-200 flex items-start">
					<Info
						className="mt-s-100 text-txt-300 h-4 w-4 shrink-0"
						aria-hidden="true"
					/>
					<div className="text-tiny text-txt-300">
						<p className="text-txt-200 font-medium">{t("formulaTitle")}</p>
						<p className="mt-s-100">{t("formula")}</p>
						<p className="mt-s-200">
							EV = ({data.winRate.toFixed(1)}% × ${data.avgWin.toFixed(2)}) - (
							{(100 - data.winRate).toFixed(1)}% × ${data.avgLoss.toFixed(2)})
						</p>
						<p className="mt-s-200">
							EV = ${((data.winRate / 100) * data.avgWin).toFixed(2)} - $
							{(((100 - data.winRate) / 100) * data.avgLoss).toFixed(2)} ={" "}
							<span
								className={isPositiveEV ? "text-trade-buy" : "text-trade-sell"}
							>
								{formatCompactCurrencyWithSign(data.expectedValue, "BRL")}
							</span>
						</p>
					</div>
				</div>
			</div>

			{/* Interpretation */}
			<div className="mt-m-400">
				<p className="text-small text-txt-200">
					{isPositiveEV
						? t.rich("systemHasPositiveEdge", {
								positive: (chunks) => (
									<span className="text-trade-buy font-semibold">{chunks}</span>
								),
								amount: () => (
									<span className="text-trade-buy font-semibold">
										{formatCompactCurrencyWithSign(data.expectedValue, "BRL")}
									</span>
								),
							})
						: t.rich("systemHasNegativeEdge", {
								negative: (chunks) => (
									<span className="text-trade-sell font-semibold">
										{chunks}
									</span>
								),
								amount: () => (
									<span className="text-trade-sell font-semibold">
										{formatCompactCurrencyWithSign(
											Math.abs(data.expectedValue),
											"BRL"
										)}
									</span>
								),
							})}
				</p>
			</div>
		</>
	)
}

export const ExpectedValue = ({ data, mode }: ExpectedValueProps) => {
	const t = useTranslations("analytics.expectedValue")
	const tTime = useTranslations("analytics.time")

	if (!data || data.sampleSize === 0) {
		return (
			<div
				id="analytics-expected-value"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<div className="gap-s-200 flex items-center">
					<Calculator className="text-txt-300 h-5 w-5" aria-hidden="true" />
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("title")}
					</h3>
				</div>
				<div className="mt-s-300 sm:mt-m-400 text-txt-300 flex h-32 items-center justify-center">
					{t("noData")}
				</div>
			</div>
		)
	}

	const hasRData = data.rSampleSize > 0

	return (
		<div
			id="analytics-expected-value"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			<div className="flex items-center justify-between">
				<div className="gap-s-200 flex items-center">
					<Calculator className="text-txt-300 h-5 w-5" aria-hidden="true" />
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{mode === "edge" ? t("edgeTitle") : t("capitalTitle")}
					</h3>
				</div>
				<div className="gap-s-200 flex items-center">
					<span className="text-tiny text-txt-300">
						{t("basedOn", {
							count: mode === "edge" ? data.rSampleSize : data.sampleSize,
						})}
					</span>
					<SampleBadge
						n={mode === "edge" ? data.rSampleSize : data.sampleSize}
					/>
				</div>
			</div>
			{/* EV is famously sample-size sensitive. Below MIN_RELIABLE the headline
			   number is dominated by a handful of trades; surface that prominently
			   instead of letting the formula's confidence borrow false authority. */}
			{classifySample(mode === "edge" ? data.rSampleSize : data.sampleSize) ===
				"insufficient" && (
				<div className="border-warning/30 bg-warning/5 p-s-300 gap-s-200 mt-s-300 flex items-start rounded-lg border">
					<AlertTriangle
						className="text-warning mt-s-100 h-4 w-4 shrink-0"
						aria-hidden="true"
					/>
					<p className="text-tiny text-txt-200">
						{tTime("insufficientSample")} —{" "}
						<span className="text-txt-300">
							n &lt; {SAMPLE_THRESHOLDS.MIN_VISIBLE}
						</span>
					</p>
				</div>
			)}

			{mode === "edge" ? (
				hasRData ? (
					<EdgeExpectancyDisplay data={data} />
				) : (
					<div className="mt-m-400 text-txt-300 flex h-32 items-center justify-center">
						{t("noRData")}
					</div>
				)
			) : (
				<CapitalExpectancyDisplay data={data} />
			)}
		</div>
	)
}
