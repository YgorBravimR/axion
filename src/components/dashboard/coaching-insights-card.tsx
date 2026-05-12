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
import { Panel } from "@/components/ui/panel"
import { getCoachingContext } from "@/app/actions/coaching"
import type { CoachingContext } from "@/app/actions/coaching.types"
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

interface SeverityStyle {
	border: string
	bg: string
	badge: string
}

const DEFAULT_SEVERITY_STYLE: SeverityStyle = {
	border: "border-bg-300",
	bg: "bg-bg-300/30",
	badge: "bg-bg-300/60 text-txt-200",
}

const SEVERITY_STYLES: Record<string, SeverityStyle> = {
	warning: {
		border: "border-destructive/30",
		bg: "bg-destructive/5",
		badge: "bg-destructive/20 text-destructive",
	},
	attention: {
		border: "border-warning/30",
		bg: "bg-warning/5",
		badge: "bg-warning/20 text-warning",
	},
	info: DEFAULT_SEVERITY_STYLE,
}

const InsightRow = memo(({ insight }: { insight: CoachingInsight }) => {
	const t = useTranslations("coaching")
	const [isExpanded, setIsExpanded] = useState(false)

	const Icon = CATEGORY_ICONS[insight.category] ?? Brain
	const styles = SEVERITY_STYLES[insight.severity] ?? DEFAULT_SEVERITY_STYLE

	// Resolve translated title and description
	const title = t(insight.titleKey.replace("coaching.", ""))
	const description = t(
		insight.descriptionKey.replace("coaching.", ""),
		insight.params
	)

	return (
		<div
			className={cn(
				"p-s-300 rounded-lg border transition-colors",
				styles.border,
				isExpanded && styles.bg
			)}
		>
			<button
				type="button"
				tabIndex={0}
				className="gap-s-200 flex w-full items-center text-left"
				onClick={() => setIsExpanded(!isExpanded)}
				aria-expanded={isExpanded}
				aria-controls={`insight-${insight.id}-content`}
				aria-label={title}
			>
				<Icon className="text-txt-300 h-4 w-4 shrink-0" />
				<div className="min-w-0 flex-1">
					<div className="gap-s-200 flex items-center">
						<span className="text-small text-txt-100 truncate font-medium">
							{title}
						</span>
						<span
							className={cn(
								"text-micro shrink-0 rounded-sm px-1.5 py-0.5 font-medium",
								styles.badge
							)}
						>
							{t(`severity.${insight.severity}`)}
						</span>
					</div>
				</div>
				{isExpanded ? (
					<ChevronUp className="text-txt-300 h-3 w-3 shrink-0" />
				) : (
					<ChevronDown className="text-txt-300 h-3 w-3 shrink-0" />
				)}
			</button>

			{isExpanded && (
				<div id={`insight-${insight.id}-content`} className="mt-s-200 pl-m-400">
					<p className="text-tiny text-txt-200">{description}</p>
					<div className="mt-s-200 gap-s-200 flex items-center">
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

const CoachingInsightsCardBase = ({
	initialContext,
}: CoachingInsightsCardProps) => {
	const t = useTranslations("coaching")
	const [context, setContext] = useState<CoachingContext | null>(
		initialContext ?? null
	)
	const [isPending, startTransition] = useTransition()
	const hasLoadedRef = useRef(!!initialContext)

	// Load coaching context on mount if not provided
	useEffect(() => {
		if (hasLoadedRef.current) {
			return
		}
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
		<Panel id="dashboard-coaching-insights" padding="md">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="gap-s-200 flex items-center">
					<Brain className="text-acc-100 h-5 w-5" />
					<h2 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("title")}
					</h2>
				</div>
				{context && (
					<span className="text-micro text-txt-300">
						{t("tradeCount", { count: context.tradeCount })}
					</span>
				)}
			</div>

			{/* Content */}
			<div className="mt-s-300 sm:mt-m-400">
				{isPending && !context ? (
					<div className="space-y-s-200 animate-pulse motion-reduce:animate-none">
						<div className="bg-bg-300 h-10 rounded-lg" />
						<div className="bg-bg-300 h-10 rounded-lg" />
						<div className="bg-bg-300 h-10 rounded-lg" />
					</div>
				) : isPending ? (
					<div className="py-m-500 flex items-center justify-center">
						<Loader2 className="text-txt-300 h-5 w-5 animate-spin motion-reduce:animate-none" />
					</div>
				) : displayInsights.length === 0 ? (
					<p className="py-m-400 text-tiny text-txt-300 text-center">
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
		</Panel>
	)
}

const CoachingInsightsCard = memo(CoachingInsightsCardBase)
CoachingInsightsCard.displayName = "CoachingInsightsCard"

export { CoachingInsightsCard }
