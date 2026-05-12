"use client"

import { memo } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

interface QuickFilter {
	key: string
	labelKey: string
	params: Record<string, string | string[]>
}

const QUICK_FILTERS: QuickFilter[] = [
	{
		key: "morningTrades",
		labelKey: "presets.morningTrades",
		params: { hourFrom: "9", hourTo: "12" },
	},
	{
		key: "losingTrades",
		labelKey: "presets.losingTrades",
		params: { outcomes: ["loss"] },
	},
	{
		key: "winningTrades",
		labelKey: "presets.winningTrades",
		params: { outcomes: ["win"] },
	},
	{
		key: "unfollowedPlan",
		labelKey: "presets.unfollowedPlan",
		params: { followedPlan: "false" },
	},
	{
		key: "aRatedOnly",
		labelKey: "presets.aRatedOnly",
		params: { rating: ["A"] },
	},
	{
		key: "highPnl",
		labelKey: "presets.highPnl",
		params: { pnlMin: "500" },
	},
]

interface QuickFiltersProps {
	activeFilterKey: string | null
	onApply: (_params: Record<string, string | string[]>, _key: string) => void
	onClear: () => void
}

const QuickFilters = memo(
	({ activeFilterKey, onApply, onClear }: QuickFiltersProps) => {
		const t = useTranslations("journal.smartSearch")

		const handleClick = (filter: QuickFilter) => {
			if (activeFilterKey === filter.key) {
				onClear()
				return
			}
			onApply(filter.params, filter.key)
		}

		return (
			<div
				className="gap-s-200 flex flex-wrap"
				role="group"
				aria-label={t("quickFilters")}
			>
				{QUICK_FILTERS.map((filter) => (
					<button
						key={filter.key}
						type="button"
						tabIndex={0}
						onClick={() => handleClick(filter)}
						className={cn(
							"px-s-300 py-s-200 text-tiny focus-visible:ring-acc-100 rounded-full border font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
							activeFilterKey === filter.key
								? "border-txt-200 bg-bg-300 text-txt-100"
								: "border-bg-300 text-txt-300 hover:border-txt-300 hover:text-txt-200"
						)}
						aria-pressed={activeFilterKey === filter.key}
					>
						{t(filter.labelKey)}
					</button>
				))}
			</div>
		)
	}
)

QuickFilters.displayName = "QuickFilters"

export { QuickFilters, QUICK_FILTERS, type QuickFilter }
