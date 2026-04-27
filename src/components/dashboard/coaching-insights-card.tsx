"use client"

import { memo, useState, useEffect, useTransition, useRef } from "react"
import { useTranslations } from "next-intl"
import {
	Brain,
	Clock,
	Target,
	ShieldAlert,
	Receipt,
	ChevronDown,
	ChevronUp,
	Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getCoachingContext, type CoachingContext } from "@/app/actions/coaching"
import type { CoachingInsight } from "@/lib/coaching/pattern-detector"

interface CoachingInsightsCardProps {
	initialContext?: CoachingContext | null
}

const CATEGORY_ICONS: Record<string, typeof Brain> = {
	time: Clock,
	strategy: Target,
	risk: ShieldAlert,
	psychology: Brain,
	fees: Receipt,
}

const SEVERITY_STYLES: Record<string, { border: string; bg: string; badge: string }> = {
	warning: {
		border: "border-trade-sell/30",
		bg: "bg-trade-sell/5",
		badge: "bg-trade-sell/20 text-trade-sell",
	},
	attention: {
		border: "border-warning/30",
		bg: "bg-warning/5",
		badge: "bg-warning/20 text-warning",
	},
	info: {
		border: "border-acc-100/20",
		bg: "bg-acc-100/5",
		badge: "bg-acc-100/20 text-acc-100",
	},
}

const InsightRow = memo(({ insight }: { insight: CoachingInsight }) => {
	const t = useTranslations("coaching")
	const [isExpanded, setIsExpanded] = useState(false)

	const Icon = CATEGORY_ICONS[insight.category] || Brain
	const styles = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info

	// Resolve translated title and description
	const title = t(insight.titleKey.replace("coaching.", ""))
	const description = t(insight.descriptionKey.replace("coaching.", ""), insight.params)

	return (
		<div
			className={cn(
				"rounded-lg border p-s-300 transition-colors",
				styles.border,
				isExpanded && styles.bg
			)}
		>
			<button
				type="button"
				tabIndex={0}
				className="flex w-full items-center gap-s-200 text-left"
				onClick={() => setIsExpanded(!isExpanded)}
				aria-expanded={isExpanded} aria-controls={`insight-${insight.id}-content`}
				aria-label={title}
			>
				<Icon className="h-4 w-4 shrink-0 text-txt-300" />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-s-200">
						<span className="text-small font-medium text-txt-100 truncate">
							{title}
						</span>
						<span className={cn("text-micro shrink-0 rounded px-1.5 py-0.5 font-medium", styles.badge)}>
							{t(`severity.${insight.severity}`)}
						</span>
					</div>
				</div>
				{isExpanded ? (
					<ChevronUp className="h-3 w-3 shrink-0 text-txt-300" />
				) : (
					<ChevronDown className="h-3 w-3 shrink-0 text-txt-300" />
				)}
			</button>

			{isExpanded && (
				<div id={`insight-${insight.id}-content`} className="mt-s-200 pl-m-400">
					<p className="text-tiny text-txt-200">{description}</p>
					<div className="mt-s-200 flex items-center gap-s-200">
						<span className="text-micro text-txt-300">
							{t(`category.${insight.category}`)}
						</span>
						<span className="text-micro text-txt-300">
							{Math.round(insight.confidence * 100)}%
						</span>
					</div>
				</div>
			)}
		</div>
	)
})

InsightRow.displayName = "InsightRow"

const CoachingInsightsCard = ({ initialContext }: CoachingInsightsCardProps) => {
	const t = useTranslations("coaching")
	const [context, setContext] = useState<CoachingContext | null>(initialContext ?? null)
	const [isPending, startTransition] = useTransition()
	const hasLoadedRef = useRef(!!initialContext)

	// Load coaching context on mount if not provided
	useEffect(() => {
		if (hasLoadedRef.current) return
		hasLoadedRef.current = true

		const COACHING_ANALYSIS_DAYS = 90
		startTransition(async () => {
			const result = await getCoachingContext(COACHING_ANALYSIS_DAYS)
			if (result.status === "success" && result.data) {
				setContext(result.data)
			}
		})
	}, [])

	const insights = context?.insights ?? []
	const displayInsights = insights.slice(0, 5)

	return (
		<div
			id="dashboard-coaching-insights"
			className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400"
		>
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-s-200">
					<Brain className="h-5 w-5 text-acc-100" />
					<h2 className="text-small sm:text-body font-semibold text-txt-100">
						{t("title")}
					</h2>
				</div>
				{context && (
					<span className="text-micro text-txt-300">
						{t("tradeCount", { count: context.tradeCount })}
					</span>
				)}
			</div>

			<p className="mt-s-100 text-tiny text-txt-300">{t("subtitle")}</p>

			{/* Content */}
			<div className="mt-s-300 sm:mt-m-400">
				{isPending && !context ? (
					<div className="space-y-s-200 animate-pulse">
						<div className="h-10 rounded-lg bg-bg-300" />
						<div className="h-10 rounded-lg bg-bg-300" />
						<div className="h-10 rounded-lg bg-bg-300" />
					</div>
				) : isPending ? (
					<div className="flex items-center justify-center py-m-500">
						<Loader2 className="h-5 w-5 animate-spin text-txt-300 motion-reduce:animate-none" />
					</div>
				) : displayInsights.length === 0 ? (
					<p className="py-m-400 text-center text-tiny text-txt-300">
						{context?.tradeCount === 0 ? t("noTrades") : t("noInsights")}
					</p>
				) : (
					<div className="space-y-s-200">
						{displayInsights.map((insight) => (
							<InsightRow key={insight.id} insight={insight} />
						))}
					</div>
				)}
			</div>

		</div>
	)
}

export { CoachingInsightsCard }
