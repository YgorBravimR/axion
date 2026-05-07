"use client"

import { memo, useMemo } from "react"
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

interface TagSectionProps {
	tags: TagStats[]
	type: TagType
	title: string
	isRMode: boolean
	maxCount: number
	tHeaders: ReturnType<typeof useTranslations>
}

const TagSection = memo(
	({ tags, type, title, isRMode, maxCount, tHeaders }: TagSectionProps) => {
		if (tags.length === 0) {
			return null
		}

		const getTagSize = (count: number): string => {
			const ratio = count / maxCount
			if (ratio > 0.7) {
				return "text-body"
			}
			if (ratio > 0.4) {
				return "text-small"
			}
			return "text-tiny"
		}

		return (
			<div className="space-y-s-300">
				<h4 className="text-tiny text-txt-300 font-medium">{title}</h4>
				<div className="gap-s-200 flex flex-wrap">
					{tags.map((tag) => (
						<div
							key={tag.tagId}
							className={`group p-s-300 relative rounded-lg border transition-transform hover:scale-105 ${getTagTypeColor(type)}`}
						>
							<div className="gap-s-200 flex items-center">
								<Tag className="text-txt-300 h-3 w-3" />
								<span
									className={`text-txt-100 font-medium ${getTagSize(tag.tradeCount)}`}
								>
									{tag.tagName}
								</span>
								<span className="bg-bg-300 px-s-200 py-s-100 text-tiny text-txt-200 rounded-full">
									{tag.tradeCount}
								</span>
							</div>

							{/* Tooltip on hover/focus */}
							<div className="mb-s-200 border-bg-300 bg-bg-200 p-s-300 absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 rounded-lg border shadow-lg group-focus-within:block group-hover:block">
								<div className="text-tiny whitespace-nowrap">
									{isRMode ? (
										<>
											{tag.avgR !== 0 && (
												<p
													className={
														tag.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"
													}
												>
													{tHeaders("avgR")}: {formatR(tag.avgR)}
												</p>
											)}
											<p className="text-txt-200">
												{tHeaders("winRate")}: {tag.winRate.toFixed(1)}%
											</p>
											<p
												className={
													tag.totalPnl >= 0
														? "text-trade-buy"
														: "text-trade-sell"
												}
											>
												{tHeaders("pnl")}:{" "}
												{formatCompactCurrencyWithSign(tag.totalPnl, "R$")}
											</p>
										</>
									) : (
										<>
											<p
												className={
													tag.totalPnl >= 0
														? "text-trade-buy"
														: "text-trade-sell"
												}
											>
												{tHeaders("pnl")}:{" "}
												{formatCompactCurrencyWithSign(tag.totalPnl, "R$")}
											</p>
											<p className="text-txt-200">
												{tHeaders("winRate")}: {tag.winRate.toFixed(1)}%
											</p>
											{tag.avgR !== 0 && (
												<p
													className={
														tag.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"
													}
												>
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
)

TagSection.displayName = "TagSection"

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

	const { setupTags, mistakeTags, generalTags, maxCount } = useMemo(
		() => ({
			setupTags: data.filter((tag) => tag.tagType === "setup"),
			mistakeTags: data.filter((tag) => tag.tagType === "mistake"),
			generalTags: data.filter((tag) => tag.tagType === "general"),
			maxCount: Math.max(...data.map((tag) => tag.tradeCount), 1),
		}),
		[data]
	)

	const { totalMistakeCost, bestSetup } = useMemo(() => {
		const metric = (tag: TagStats): number =>
			isRMode ? tag.avgR : tag.totalPnl
		return {
			totalMistakeCost: mistakeTags.reduce(
				(sum, tag) => sum + Math.abs(Math.min(0, metric(tag))),
				0
			),
			bestSetup: setupTags.reduce(
				(best, tag) => (!best || metric(tag) > metric(best) ? tag : best),
				null as TagStats | null
			),
		}
	}, [mistakeTags, setupTags, isRMode])

	if (data.length === 0) {
		return (
			<div
				id="analytics-tag-cloud"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("title")}
				</h3>
				<div className="mt-s-300 sm:mt-m-400 text-txt-300 flex h-32 items-center justify-center">
					{t("noTags")}
				</div>
			</div>
		)
	}

	return (
		<div
			id="analytics-tag-cloud"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			<h3 className="text-small sm:text-body text-txt-100 font-semibold">
				{t("title")}
			</h3>

			{/* Summary Stats */}
			<div className="mt-s-300 sm:mt-m-400 gap-s-300 sm:gap-m-400 grid grid-cols-2 md:grid-cols-3">
				<div className="bg-bg-100 p-s-300 rounded-lg text-center">
					<p className="text-tiny text-txt-300">{t("totalTags")}</p>
					<p className="mt-s-100 text-h3 text-txt-100 font-bold">
						{data.length}
					</p>
				</div>
				{bestSetup && (
					<div className="bg-bg-100 p-s-300 rounded-lg text-center">
						<p className="text-tiny text-txt-300">{t("bestSetup")}</p>
						<p className="mt-s-100 text-small text-trade-buy font-bold">
							{bestSetup.tagName}
						</p>
						<p className="text-tiny text-txt-200">
							{formatMetric(getMetric(bestSetup))}
						</p>
					</div>
				)}
				{totalMistakeCost > 0 && (
					<div className="bg-bg-100 p-s-300 rounded-lg text-center">
						<p className="text-tiny text-txt-300">{t("mistakeCost")}</p>
						<p className="mt-s-100 text-small text-trade-sell font-bold">
							{formatMetric(-totalMistakeCost)}
						</p>
					</div>
				)}
			</div>

			{/* Tag Sections */}
			<div className="mt-m-400 sm:mt-m-500 space-y-m-400 sm:space-y-m-500">
				<TagSection
					tags={setupTags}
					type="setup"
					title={t("setupTags")}
					isRMode={isRMode}
					maxCount={maxCount}
					tHeaders={tHeaders}
				/>
				<TagSection
					tags={mistakeTags}
					type="mistake"
					title={t("mistakeTags")}
					isRMode={isRMode}
					maxCount={maxCount}
					tHeaders={tHeaders}
				/>
				<TagSection
					tags={generalTags}
					type="general"
					title={t("generalTags")}
					isRMode={isRMode}
					maxCount={maxCount}
					tHeaders={tHeaders}
				/>
			</div>

			{/* Detailed Table */}
			{data.filter((tag) => tag.tradeCount > 0).length > 0 && (
				<div className="mt-m-400 sm:mt-m-500">
					<h4 className="mb-s-300 text-small text-txt-200 font-medium">
						{t("detailedStats")}
					</h4>
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="border-bg-300 border-b">
									<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-left font-medium">
										{t("tag")}
									</th>
									<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-left font-medium">
										{tHeaders("type")}
									</th>
									<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
										{tHeaders("trades")}
									</th>
									<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
										{tHeaders("pnl")}
									</th>
									<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
										{tHeaders("winRate")}
									</th>
									<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
										{tHeaders("avgR")}
									</th>
								</tr>
							</thead>
							<tbody>
								{data
									.filter((tag) => tag.tradeCount > 0)
									.toSorted((a, b) => getMetric(b) - getMetric(a))
									.map((tag) => (
										<tr key={tag.tagId} className="border-bg-300/50 border-b">
											<td className="px-s-300 py-s-200 text-small text-txt-100 font-medium">
												{tag.tagName}
											</td>
											<td className="px-s-300 py-s-200">
												<span
													className={`px-s-200 py-s-100 text-tiny rounded-sm ${
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
											<td className="px-s-300 py-s-200 text-small text-txt-200 text-right">
												{tag.tradeCount}
											</td>
											<td
												className={`px-s-300 py-s-200 text-small text-right font-medium ${
													tag.totalPnl >= 0
														? "text-trade-buy"
														: "text-trade-sell"
												}`}
											>
												{formatCompactCurrencyWithSign(tag.totalPnl, "R$")}
											</td>
											<td className="px-s-300 py-s-200 text-small text-txt-200 text-right">
												{tag.winRate.toFixed(1)}%
											</td>
											<td
												className={`px-s-300 py-s-200 text-small text-right ${
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
