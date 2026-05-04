"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { BookOpen, GraduationCap, Loader2, Quote, Sparkles } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import {
	HAWKS_CONCEPTS,
	HAWKS_CRONOGRAMA,
	HAWKS_GLOSSARY,
} from "@/lib/hawks/learning-content"
import {
	fetchHawksLearningProgress,
	fetchHawksMentorInsights,
	toggleHawksLearningSection,
} from "@/app/actions/hawks-learning"
import type {
	LearningProgressRecord,
	MentorInsightRecord,
} from "@/lib/hawks/action-types"

const HawksLearningHub = () => {
	const t = useTranslations("hawksLearning.hub")
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [progressLoading, setProgressLoading] = useState(true)
	const [progress, setProgress] = useState<Record<string, LearningProgressRecord>>({})
	const [insights, setInsights] = useState<MentorInsightRecord[]>([])
	const [insightsLoading, setInsightsLoading] = useState(true)

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const [progressResult, insightsResult] = await Promise.all([
				fetchHawksLearningProgress(),
				fetchHawksMentorInsights(),
			])
			if (!mounted) return
			if (progressResult.status === "success" && progressResult.data) {
				const map: Record<string, LearningProgressRecord> = {}
				for (const row of progressResult.data) map[row.sectionKey] = row
				setProgress(map)
			}
			setProgressLoading(false)

			if (insightsResult.status === "success" && insightsResult.data) {
				setInsights(insightsResult.data)
			}
			setInsightsLoading(false)
		}
		load()
		return () => {
			mounted = false
		}
	}, [])

	const completedCount = useMemo(
		() => Object.values(progress).filter((row) => row.completedAt !== null).length,
		[progress]
	)
	const totalCount = HAWKS_CRONOGRAMA.length + HAWKS_CONCEPTS.length

	const handleToggle = (sectionKey: string) => (next: boolean | "indeterminate") => {
		const completed = next === true
		startTransition(async () => {
			const result = await toggleHawksLearningSection({ sectionKey, completed })
			if (result.status === "success" && result.data) {
				setProgress((prev) => ({ ...prev, [sectionKey]: result.data! }))
				showToast("success", result.message)
				return
			}
			showToast("error", result.message)
		})
	}

	const isComplete = (key: string) =>
		Boolean(progress[key]?.completedAt)

	return (
		<div className="space-y-m-500">
			<Card id="hawks-learning-summary">
				<CardHeader>
					<div className="flex items-start justify-between gap-m-400">
						<div className="space-y-s-100">
							<CardTitle>{t("summaryTitle")}</CardTitle>
							<CardDescription>{t("summaryDescription")}</CardDescription>
						</div>
						<div className="text-right">
							<p className="text-tiny text-text-300 uppercase tracking-wide">
								{t("progressLabel")}
							</p>
							<p className="text-h2 font-mono font-semibold text-acc-100">
								{progressLoading ? "—" : `${completedCount}/${totalCount}`}
							</p>
						</div>
					</div>
				</CardHeader>
			</Card>

			<Card id="hawks-cronograma-card">
				<CardHeader>
					<div className="flex items-center gap-s-200">
						<GraduationCap className="text-acc-100 h-5 w-5" aria-hidden="true" />
						<CardTitle>{t("cronogramaTitle")}</CardTitle>
					</div>
					<CardDescription>{t("cronogramaDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-m-400">
					{HAWKS_CRONOGRAMA.map((week) => (
						<article
							key={week.key}
							className={cn(
								"space-y-s-200 rounded-md border p-m-400",
								isComplete(week.key)
									? "border-profit/40 bg-profit/5"
									: "border-bg-300 bg-bg-200/40"
							)}
						>
							<header className="flex items-start gap-s-300">
								<Checkbox
									id={`hawks-learning-${week.key}`}
									checked={isComplete(week.key)}
									onCheckedChange={handleToggle(week.key)}
									disabled={isPending || progressLoading}
								/>
								<div className="space-y-s-100">
									<h3 className="text-body font-semibold">
										{week.title} · <span className="text-text-300">{week.dateRange}</span>
									</h3>
									<p className="text-text-200 text-small">{week.objective}</p>
								</div>
							</header>
							<div className="grid gap-m-400 pl-m-500 sm:grid-cols-2">
								<div className="space-y-s-100">
									<p className="text-text-300 text-tiny uppercase tracking-wide">
										{t("focus")}
									</p>
									<ul className="list-disc space-y-s-100 pl-m-400 text-small">
										{week.focus.map((item) => (
											<li key={item}>{item}</li>
										))}
									</ul>
								</div>
								<div className="space-y-s-100">
									<p className="text-text-300 text-tiny uppercase tracking-wide">
										{t("assignments")}
									</p>
									<ul className="list-disc space-y-s-100 pl-m-400 text-small">
										{week.assignments.map((item) => (
											<li key={item}>{item}</li>
										))}
									</ul>
								</div>
							</div>
						</article>
					))}
				</CardContent>
			</Card>

			<Card id="hawks-concepts-card">
				<CardHeader>
					<div className="flex items-center gap-s-200">
						<BookOpen className="text-acc-100 h-5 w-5" aria-hidden="true" />
						<CardTitle>{t("conceptsTitle")}</CardTitle>
					</div>
					<CardDescription>{t("conceptsDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-m-400">
					{HAWKS_CONCEPTS.map((concept) => (
						<article
							key={concept.key}
							className="flex gap-s-300 rounded-md border border-bg-300 bg-bg-200/40 p-m-400"
						>
							<Checkbox
								id={`hawks-learning-${concept.key}`}
								checked={isComplete(concept.key)}
								onCheckedChange={handleToggle(concept.key)}
								disabled={isPending || progressLoading}
							/>
							<div className="flex-1 space-y-s-200">
								<header className="space-y-s-100">
									<h3 className="text-body font-semibold">{concept.title}</h3>
									<p className="text-text-200 text-small">{concept.summary}</p>
								</header>
								<ul className="list-disc space-y-s-100 pl-m-400 text-small">
									{concept.bullets.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</div>
						</article>
					))}
				</CardContent>
			</Card>

			<Card id="hawks-glossary-card">
				<CardHeader>
					<div className="flex items-center gap-s-200">
						<Sparkles className="text-acc-100 h-5 w-5" aria-hidden="true" />
						<CardTitle>{t("glossaryTitle")}</CardTitle>
					</div>
					<CardDescription>{t("glossaryDescription")}</CardDescription>
				</CardHeader>
				<CardContent>
					<dl className="grid gap-s-300 sm:grid-cols-2">
						{HAWKS_GLOSSARY.map((entry) => (
							<div
								key={entry.term}
								className="space-y-s-100 rounded-md border border-bg-300 bg-bg-200/40 p-m-400"
							>
								<dt className="text-small font-semibold text-acc-100">
									{entry.term}
								</dt>
								<dd className="text-text-200 text-small">{entry.definition}</dd>
							</div>
						))}
					</dl>
				</CardContent>
			</Card>

			<Card id="hawks-mentor-card">
				<CardHeader>
					<div className="flex items-center gap-s-200">
						<Quote className="text-acc-100 h-5 w-5" aria-hidden="true" />
						<CardTitle>{t("mentorTitle")}</CardTitle>
					</div>
					<CardDescription>{t("mentorDescription")}</CardDescription>
				</CardHeader>
				<CardContent>
					{insightsLoading ? (
						<div className="flex items-center gap-s-200 text-text-300 text-small">
							<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
							{t("mentorLoading")}
						</div>
					) : insights.length === 0 ? (
						<p className="text-text-300 text-small">{t("mentorEmpty")}</p>
					) : (
						<ul className="space-y-s-300">
							{insights.map((insight) => (
								<li
									key={insight.id}
									className="space-y-s-100 rounded-md border border-bg-300 bg-bg-200/40 p-m-400"
								>
									<header className="flex flex-wrap items-baseline justify-between gap-s-200">
										<p className="font-medium text-small">
											{new Date(insight.date).toLocaleDateString()}
											{insight.assetSymbol ? ` · ${insight.assetSymbol}` : ""}
										</p>
										{insight.biasCalled && (
											<span className="text-acc-100 text-tiny uppercase tracking-wide">
												{insight.biasCalled}
											</span>
										)}
									</header>
									{insight.setupCalled && (
										<p className="text-text-200 text-small">{insight.setupCalled}</p>
									)}
									<p className="text-text-300 text-tiny whitespace-pre-line">
										{insight.bodyMarkdown.slice(0, 320)}
										{insight.bodyMarkdown.length > 320 ? "…" : ""}
									</p>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

export { HawksLearningHub }
