"use client"

import { Tag } from "lucide-react"
import { useTranslations } from "next-intl"
import type { TagStats, TagType } from "@/types"
import { formatCompactCurrencyWithSign, formatR } from "@/lib/formatting"
import type { ExpectancyMode } from "./expectancy-mode-toggle"

interface TagCloudProps {
	data: TagStats[]
	expectancyMode: ExpectancyMode
}

const getTagTypeColor = (type: TagType): string => {
	switch (type) {
		case "setup":
			return "border-trade-buy/50 bg-trade-buy/10"
		case "mistake":
			return "border-trade-sell/50 bg-trade-sell/10"
		case "general":
			return "border-acc-100/50 bg-acc-100/10"
		default:
			return "border-bg-300 bg-bg-100"
	}
}

export const TagCloud = ({ data, expectancyMode }: TagCloudProps) => {
	const t = useTranslations("analytics.tagCloud")
	const tHeaders = useTranslations("analytics.tableHeaders")

	const isRMode = expectancyMode === "edge"
	const formatMetric = (value: number): string =>
		isRMode ? formatR(value) : formatCompactCurrencyWithSign(value, "R$")
	const getMetric = (tag: TagStats): number =>
		isRMode ? tag.avgR : tag.totalPnl

	const getTagTypeLabel = (type: TagType): string => {
		switch (type) {
			case "setup":
				return t("setup")
			case "mistake":
				return t("mistake")
			case "general":
				return t("general")
			default:
				return type
		}
	}
	// Separate tags by type
	const setupTags = data.filter((t) => t.tagType === "setup")
	const mistakeTags = data.filter((t) => t.tagType === "mistake")
	const generalTags = data.filter((t) => t.tagType === "general")

	// Calculate max trade count for sizing
	const maxCount = Math.max(...data.map((t) => t.tradeCount), 1)

	const getTagSize = (count: number): string => {
		const ratio = count / maxCount
		if (ratio > 0.7) return "text-body"
		if (ratio > 0.4) return "text-small"
		return "text-tiny"
	}

	const getTagSectionTitle = (type: TagType): string => {
		switch (type) {
			case "setup":
				return t("setupTags")
			case "mistake":
				return t("mistakeTags")
			case "general":
				return t("generalTags")
			default:
				return `${getTagTypeLabel(type)} Tags`
		}
	}

	const renderTagSection = (tags: TagStats[], type: TagType) => {
		if (tags.length === 0) return null

		return (
			<div className="space-y-s-300">
				<h4 className="text-tiny font-medium text-txt-300">
					{getTagSectionTitle(type)}
				</h4>
				<div className="flex flex-wrap gap-s-200">
					{tags.map((tag) => (
						<div
							key={tag.tagId}
							className={`group relative rounded-lg border p-s-300 transition-transform hover:scale-105 ${getTagTypeColor(type)}`}
						>
							<div className="flex items-center gap-s-200">
								<Tag className="h-3 w-3 text-txt-300" />
								<span className={`font-medium text-txt-100 ${getTagSize(tag.tradeCount)}`}>
									{tag.tagName}
								</span>
								<span className="rounded-full bg-bg-300 px-s-200 py-s-100 text-tiny text-txt-200">
									{tag.tradeCount}
								</span>
							</div>

							{/* Tooltip on hover */}
							<div className="absolute bottom-full left-1/2 z-10 mb-s-200 hidden -translate-x-1/2 rounded-lg border border-bg-300 bg-bg-200 p-s-300 shadow-lg group-hover:block">
								<div className="whitespace-nowrap text-tiny">
									{isRMode ? (
										<>
											{tag.avgR !== 0 && (
												<p className={tag.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"}>
													{tHeaders("avgR")}: {formatR(tag.avgR)}
												</p>
											)}
											<p className="text-txt-200">{tHeaders("winRate")}: {tag.winRate.toFixed(1)}%</p>
											<p className={tag.totalPnl >= 0 ? "text-trade-buy" : "text-trade-sell"}>
												{tHeaders("pnl")}: {formatCompactCurrencyWithSign(tag.totalPnl, "R$")}
											</p>
										</>
									) : (
										<>
											<p className={tag.totalPnl >= 0 ? "text-trade-buy" : "text-trade-sell"}>
												{tHeaders("pnl")}: {formatCompactCurrencyWithSign(tag.totalPnl, "R$")}
											</p>
											<p className="text-txt-200">{tHeaders("winRate")}: {tag.winRate.toFixed(1)}%</p>
											{tag.avgR !== 0 && (
												<p className={tag.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"}>
													{tHeaders("avgR")}: {formatR(tag.avgR)}
												</p>
											)}
										</>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		)
	}

	if (data.length === 0) {
		return (
			<div id="analytics-tag-cloud" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<h3 className="text-small sm:text-body font-semibold text-txt-100">{t("title")}</h3>
				<div className="mt-s-300 sm:mt-m-400 flex h-32 items-center justify-center text-txt-300">
					{t("noTags")}
				</div>
			</div>
		)
	}

	// Calculate mistake cost and best setup based on current mode
	const totalMistakeCost = mistakeTags.reduce(
		(sum, tag) => sum + Math.abs(Math.min(0, getMetric(tag))),
		0
	)
	const bestSetup = setupTags.reduce(
		(best, tag) => (!best || getMetric(tag) > getMetric(best)) ? tag : best,
		null as TagStats | null
	)

	return (
		<div id="analytics-tag-cloud" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			<h3 className="text-small sm:text-body font-semibold text-txt-100">{t("title")}</h3>

			{/* Summary Stats */}
			<div className="mt-s-300 sm:mt-m-400 grid grid-cols-2 gap-s-300 sm:gap-m-400 md:grid-cols-3">
				<div className="rounded-lg bg-bg-100 p-s-300 text-center">
					<p className="text-tiny text-txt-300">{t("totalTags")}</p>
					<p className="mt-s-100 text-h3 font-bold text-txt-100">{data.length}</p>
				</div>
				{bestSetup && (
					<div className="rounded-lg bg-bg-100 p-s-300 text-center">
						<p className="text-tiny text-txt-300">{t("bestSetup")}</p>
						<p className="mt-s-100 text-small font-bold text-trade-buy">
							{bestSetup.tagName}
						</p>
						<p className="text-tiny text-txt-200">
							{formatMetric(getMetric(bestSetup))}
						</p>
					</div>
				)}
				{totalMistakeCost > 0 && (
					<div className="rounded-lg bg-bg-100 p-s-300 text-center">
						<p className="text-tiny text-txt-300">{t("mistakeCost")}</p>
						<p className="mt-s-100 text-small font-bold text-trade-sell">
							{formatMetric(-totalMistakeCost)}
						</p>
					</div>
				)}
			</div>

			{/* Tag Sections */}
			<div className="mt-m-400 sm:mt-m-500 space-y-m-400 sm:space-y-m-500">
				{renderTagSection(setupTags, "setup")}
				{renderTagSection(mistakeTags, "mistake")}
				{renderTagSection(generalTags, "general")}
			</div>

			{/* Detailed Table */}
			{data.filter((tag) => tag.tradeCount > 0).length > 0 && (
				<div className="mt-m-400 sm:mt-m-500">
					<h4 className="mb-s-300 text-small font-medium text-txt-200">
						{t("detailedStats")}
					</h4>
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="border-b border-bg-300">
									<th className="px-s-300 py-s-200 text-left text-tiny font-medium text-txt-300">
										{t("tag")}
									</th>
									<th className="px-s-300 py-s-200 text-left text-tiny font-medium text-txt-300">
										{tHeaders("type")}
									</th>
									<th className="px-s-300 py-s-200 text-right text-tiny font-medium text-txt-300">
										{tHeaders("trades")}
									</th>
									<th className="px-s-300 py-s-200 text-right text-tiny font-medium text-txt-300">
										{tHeaders("pnl")}
									</th>
									<th className="px-s-300 py-s-200 text-right text-tiny font-medium text-txt-300">
										{tHeaders("winRate")}
									</th>
									<th className="px-s-300 py-s-200 text-right text-tiny font-medium text-txt-300">
										{tHeaders("avgR")}
									</th>
								</tr>
							</thead>
							<tbody>
								{data
									.filter((tag) => tag.tradeCount > 0)
									.toSorted((a, b) => getMetric(b) - getMetric(a))
									.map((tag) => (
										<tr key={tag.tagId} className="border-b border-bg-300/50">
											<td className="px-s-300 py-s-200 text-small font-medium text-txt-100">
												{tag.tagName}
											</td>
											<td className="px-s-300 py-s-200">
												<span
													className={`rounded px-s-200 py-s-100 text-tiny ${
														tag.tagType === "setup"
															? "bg-trade-buy/20 text-trade-buy"
															: tag.tagType === "mistake"
																? "bg-trade-sell/20 text-trade-sell"
																: "bg-acc-100/20 text-acc-100"
													}`}
												>
													{getTagTypeLabel(tag.tagType)}
												</span>
											</td>
											<td className="px-s-300 py-s-200 text-right text-small text-txt-200">
												{tag.tradeCount}
											</td>
											<td
												className={`px-s-300 py-s-200 text-right text-small font-medium ${
													tag.totalPnl >= 0 ? "text-trade-buy" : "text-trade-sell"
												}`}
											>
												{formatCompactCurrencyWithSign(tag.totalPnl, "R$")}
											</td>
											<td className="px-s-300 py-s-200 text-right text-small text-txt-200">
												{tag.winRate.toFixed(1)}%
											</td>
											<td
												className={`px-s-300 py-s-200 text-right text-small ${
													tag.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"
												}`}
											>
												{tag.avgR >= 0 ? "+" : ""}
												{tag.avgR.toFixed(2)}R
											</td>
										</tr>
									))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	)
}
