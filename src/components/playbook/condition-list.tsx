"use client"

import {
	useEffect,
	useState,
	useCallback,
	useMemo,
	type ReactNode,
} from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { getConditions } from "@/app/actions/trading-conditions"
import type { TradingCondition } from "@/db/schema"
import { cn } from "@/lib/utils"

const CATEGORY_ORDER = [
	"indicator",
	"price_action",
	"market_context",
	"custom",
] as const

const getCategoryColor = (category: string): string => {
	switch (category) {
		case "indicator":
			return "text-acc-100"
		case "price_action":
			return "text-trade-buy"
		case "market_context":
			return "text-warning"
		case "custom":
			return "text-txt-200"
		default:
			return "text-txt-300"
	}
}

const toCategoryKey = (category: string): string =>
	`category${category.charAt(0).toUpperCase()}${category.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`

interface ConditionListProps {
	/** Restrict the list to a specific set of condition IDs (e.g., strategy-bound only). Undefined = show all user conditions. */
	filterIds?: string[]
	/** Optional content rendered above the grouped list (e.g., rank preview, helper text). */
	header?: ReactNode
	/** Optional content rendered after the grouped list (e.g., a "create new" CTA). */
	footer?: ReactNode
	/** Rendered when no conditions match the filter. Defaults to nothing. */
	emptyState?: ReactNode
	/** Render the per-row control (right-aligned slot). */
	renderRowControl: (_condition: TradingCondition) => ReactNode
}

export const ConditionList = ({
	filterIds,
	header,
	footer,
	emptyState,
	renderRowControl,
}: ConditionListProps) => {
	const tSettings = useTranslations("settings.conditions")
	const [conditions, setConditions] = useState<TradingCondition[]>([])
	const [isLoading, setIsLoading] = useState(true)

	const loadConditions = useCallback(async () => {
		setIsLoading(true)
		const result = await getConditions()
		if (result.status === "success" && result.data) {
			setConditions(result.data)
		}
		setIsLoading(false)
	}, [])

	useEffect(() => {
		void loadConditions()
	}, [loadConditions])

	const grouped = useMemo(() => {
		const visible = filterIds
			? conditions.filter((c) => filterIds.includes(c.id))
			: conditions
		return CATEGORY_ORDER.map((cat) => ({
			category: cat,
			items: visible.filter((c) => c.category === cat),
		})).filter((g) => g.items.length > 0)
	}, [conditions, filterIds])

	if (isLoading) {
		return (
			<div className="p-s-300 sm:p-m-400 lg:p-m-500 flex items-center justify-center">
				<Loader2 className="text-txt-300 h-5 w-5 animate-spin motion-reduce:animate-none" />
			</div>
		)
	}

	if (grouped.length === 0) {
		return <>{emptyState}</>
	}

	return (
		<div className="space-y-m-400">
			{header}
			{grouped.map((group) => (
				<div key={group.category}>
					<h4
						className={cn(
							"text-small mb-s-200 font-medium",
							getCategoryColor(group.category)
						)}
					>
						{tSettings(toCategoryKey(group.category))}
					</h4>
					<div className="space-y-s-200">
						{group.items.map((condition) => (
							<div
								key={condition.id}
								className="border-bg-300 bg-bg-200 gap-s-200 sm:gap-m-400 p-s-200 sm:p-s-300 flex flex-col rounded-lg border transition-colors sm:flex-row sm:items-center sm:justify-between"
							>
								<div className="min-w-0 flex-1">
									<p className="text-small text-txt-100 font-medium">
										{condition.name}
									</p>
									{condition.description && (
										<p className="text-tiny text-txt-300 line-clamp-1">
											{condition.description}
										</p>
									)}
								</div>
								{renderRowControl(condition)}
							</div>
						))}
					</div>
				</div>
			))}
			{footer}
		</div>
	)
}
