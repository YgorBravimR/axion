"use client"

import { useTranslations } from "next-intl"
import { AlertTriangle, CheckCircle } from "lucide-react"
import type { SimulationPreview } from "@/types/risk-simulation"

interface PreviewBannerProps {
	preview: SimulationPreview | null
	isLoading: boolean
	allTradesLackSl: boolean
}

const PreviewBanner = ({ preview, isLoading, allTradesLackSl }: PreviewBannerProps) => {
	const t = useTranslations("riskSimulation.preview")

	if (isLoading) {
		return (
			<div className="bg-bg-100 border-bg-300 rounded-md border p-3">
				<p className="text-small text-txt-300 animate-pulse motion-reduce:animate-none">{t("loading")}</p>
			</div>
		)
	}

	if (!preview) return null

	if (preview.totalTrades === 0) {
		return (
			<div className="border-bg-300 bg-bg-100 rounded-md border p-3">
				<p className="text-small text-txt-300">{t("noTrades")}</p>
			</div>
		)
	}

	const slCoverage = Math.round((preview.tradesWithSl / preview.totalTrades) * 100)

	return (
		<div className="border-bg-300 bg-bg-100 rounded-md border p-3">
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex items-center gap-2">
					{allTradesLackSl ? (
						<AlertTriangle className="text-fb-error h-4 w-4 shrink-0" aria-hidden="true" />
					) : (
						<CheckCircle className="text-trade-buy h-4 w-4 shrink-0" aria-hidden="true" />
					)}
					<span className="text-small text-txt-100">
						{t("totalTrades", { count: preview.totalTrades })}
					</span>
				</div>
				<span className="text-small text-txt-300">
					{t("withSl", { count: preview.tradesWithSl })}
				</span>
				<span className="text-small text-txt-300">
					{t("withoutSl", { count: preview.tradesWithoutSl })}
				</span>
				<span className="text-small text-txt-300">
					{t("slCoverage", { percent: slCoverage })}
				</span>
				<span className="text-small text-txt-300">
					{t("days", { count: preview.dayCount })}
				</span>
				<span className="text-small text-txt-300">
					{t("assets", { list: preview.assets.join(", ") })}
				</span>
			</div>
			{allTradesLackSl && (
				<p className="text-small text-fb-error mt-2">
					{t("allTradesLackSl")}
				</p>
			)}
			{preview.tradesWithoutSl > 0 && !allTradesLackSl && (
				<p className="text-tiny text-warning mt-2">
					{t("someTradesLackSl", { count: preview.tradesWithoutSl })}
				</p>
			)}
		</div>
	)
}

export { PreviewBanner }
