"use client"

import { useMemo, useState, useTransition } from "react"
import { useTranslations, useLocale } from "next-intl"
import {
	ArrowLeft,
	ArrowRight,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Loader2,
	ShieldAlert,
	TrendingDown,
	TrendingUp,
} from "lucide-react"
import { format, parseISO, type Locale } from "date-fns"
import { ptBR, enUS } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { useFormatting } from "@/hooks/use-formatting"
import { Link } from "@/i18n/routing"
import { saveWeeklyReview } from "@/app/actions/weekly-review"
import type { WeeklyReviewPayload } from "@/app/actions/weekly-review.types"

interface WeeklyReviewFlowProps {
	payload: WeeklyReviewPayload
	/** Optional AI Assistant trigger (server-rendered). Null when the gate
	 * is closed for this user; rendered next to the page title when open. */
	assistantSlot?: React.ReactNode
}

type PhaseId =
	| "replay"
	| "adherence"
	| "metrics"
	| "mistakes"
	| "risco"
	| "forward"

const PHASES: ReadonlyArray<PhaseId> = [
	"replay",
	"adherence",
	"metrics",
	"mistakes",
	"risco",
	"forward",
]

const WeeklyReviewFlow = ({
	payload,
	assistantSlot,
}: WeeklyReviewFlowProps) => {
	const t = useTranslations("review.weekly")
	const tCommon = useTranslations("common")
	const locale = useLocale()
	const dateLocale = locale === "pt-BR" ? ptBR : enUS
	const { formatCurrencyWithSign } = useFormatting()
	const { showToast } = useToast()

	const [phaseIdx, setPhaseIdx] = useState(0)
	const [tradeIdx, setTradeIdx] = useState(0)
	const [lesson, setLesson] = useState(payload.saved.lesson)
	const [ruleChange, setRuleChange] = useState(payload.saved.ruleChange)
	const [focusNextWeek, setFocusNextWeek] = useState(
		payload.saved.focusNextWeek
	)
	const [isPending, startTransition] = useTransition()
	const [completedAt, setCompletedAt] = useState(payload.saved.completedAt)

	const phase = PHASES[phaseIdx]!

	const goNext = () => setPhaseIdx((i) => Math.min(PHASES.length - 1, i + 1))
	const goPrev = () => setPhaseIdx((i) => Math.max(0, i - 1))

	const handleSave = (markCompleted: boolean) => {
		startTransition(async () => {
			const result = await saveWeeklyReview({
				isoYear: payload.isoYear,
				isoWeek: payload.isoWeek,
				lesson,
				ruleChange,
				focusNextWeek,
				markCompleted,
			})
			if (result.status === "success") {
				showToast("success", t("saved"))
				if (markCompleted) {
					setCompletedAt(new Date().toISOString())
				}
			} else {
				showToast("error", result.message)
			}
		})
	}

	const weekLabel = useMemo(
		() =>
			`${format(parseISO(payload.weekStart), "MMM d", { locale: dateLocale })} – ${format(parseISO(payload.weekEnd), "MMM d, yyyy", { locale: dateLocale })}`,
		[payload.weekStart, payload.weekEnd, dateLocale]
	)

	return (
		<div className="space-y-m-500 mx-auto max-w-4xl">
			{/* Header */}
			<header className="space-y-s-200">
				<div className="gap-s-200 flex items-center justify-between">
					<div>
						<h1 className="text-h2 text-txt-100 font-semibold">{t("title")}</h1>
						<p className="text-small text-txt-200">
							{t("weekHeader", {
								week: payload.isoWeek,
								year: payload.isoYear,
							})}{" "}
							· {weekLabel}
						</p>
					</div>
					<div className="gap-s-200 flex items-center">
						{completedAt ? (
							<Badge
								id="weekly-review-completed-badge"
								variant="outline"
								className="gap-s-100 text-trade-buy"
							>
								<CheckCircle2 className="h-3 w-3" aria-hidden />
								{t("completed")}
							</Badge>
						) : null}
						{assistantSlot}
					</div>
				</div>

				{/* Phase progress */}
				<div className="gap-s-100 flex flex-wrap">
					{PHASES.map((p, i) => (
						<button
							key={p}
							type="button"
							onClick={() => setPhaseIdx(i)}
							className={cn(
								"px-s-300 py-s-100 text-tiny rounded-md border transition-colors",
								i === phaseIdx
									? "border-acc-100 bg-acc-100/10 text-txt-100"
									: i < phaseIdx
										? "border-bg-300 bg-bg-200 text-txt-200"
										: "border-bg-300 text-txt-300"
							)}
						>
							{i + 1}. {t(`phases.${p}.label`)}
						</button>
					))}
				</div>
			</header>

			{/* No trades short-circuit (but forward phase still useful) */}
			{!payload.hasTrades && phase !== "forward" ? (
				<div className="border-bg-300 bg-bg-200 p-m-500 rounded-lg border text-center">
					<p className="text-txt-200">{t("noTrades")}</p>
					<Button
						id="weekly-review-skip-to-forward"
						className="mt-m-400"
						variant="outline"
						onClick={() => setPhaseIdx(PHASES.length - 1)}
					>
						{t("skipToForward")}
					</Button>
				</div>
			) : (
				<section className="border-bg-300 bg-bg-200 p-m-500 space-y-m-500 rounded-lg border">
					<div>
						<h2 className="text-body text-txt-100 font-semibold">
							{t(`phases.${phase}.title`)}
						</h2>
						<p className="text-small text-txt-300">
							{t(`phases.${phase}.subtitle`)}
						</p>
					</div>

					{phase === "replay" && (
						<ReplayPhase
							trades={payload.trades}
							tradeIdx={tradeIdx}
							setTradeIdx={setTradeIdx}
							formatCurrencyWithSign={formatCurrencyWithSign}
							dateLocale={dateLocale}
							t={t}
							tCommon={tCommon}
						/>
					)}

					{phase === "adherence" && (
						<AdherencePhase
							adherence={payload.adherence}
							trades={payload.trades}
							t={t}
							formatCurrencyWithSign={formatCurrencyWithSign}
						/>
					)}

					{phase === "metrics" && (
						<MetricsPhase
							summary={payload.summary}
							dailyBreakdown={payload.dailyBreakdown}
							insights={payload.insights}
							formatCurrencyWithSign={formatCurrencyWithSign}
							dateLocale={dateLocale}
							t={t}
						/>
					)}

					{phase === "mistakes" && (
						<MistakesPhase
							mistakes={payload.mistakes}
							t={t}
							formatCurrencyWithSign={formatCurrencyWithSign}
						/>
					)}

					{phase === "risco" && (
						<RiscoPhase
							risco={payload.risco}
							adherence={payload.adherence}
							t={t}
							formatCurrencyWithSign={formatCurrencyWithSign}
							dateLocale={dateLocale}
						/>
					)}

					{phase === "forward" && (
						<ForwardPhase
							lesson={lesson}
							ruleChange={ruleChange}
							focusNextWeek={focusNextWeek}
							setLesson={setLesson}
							setRuleChange={setRuleChange}
							setFocusNextWeek={setFocusNextWeek}
							onSave={handleSave}
							isPending={isPending}
							t={t}
							completedAt={completedAt}
						/>
					)}
				</section>
			)}

			{/* Phase nav */}
			<div className="gap-s-300 flex items-center justify-between">
				<Button
					id="weekly-review-prev-phase"
					variant="ghost"
					onClick={goPrev}
					disabled={phaseIdx === 0}
				>
					<ArrowLeft className="mr-s-100 h-4 w-4" aria-hidden />
					{t("prevPhase")}
				</Button>
				<span className="text-tiny text-txt-300">
					{phaseIdx + 1} / {PHASES.length}
				</span>
				<Button
					id="weekly-review-next-phase"
					variant="outline"
					onClick={goNext}
					disabled={phaseIdx === PHASES.length - 1}
				>
					{t("nextPhase")}
					<ArrowRight className="ml-s-100 h-4 w-4" aria-hidden />
				</Button>
			</div>
		</div>
	)
}

// ────────────────────────────────────────────────────────────────────
// Phase 1 — Replay
// ────────────────────────────────────────────────────────────────────

interface ReplayPhaseProps {
	trades: WeeklyReviewPayload["trades"]
	tradeIdx: number
	setTradeIdx: (_value: number) => void
	formatCurrencyWithSign: (_value: number) => string
	dateLocale: Locale
	t: ReturnType<typeof useTranslations>
	tCommon: ReturnType<typeof useTranslations>
}

const ReplayPhase = ({
	trades,
	tradeIdx,
	setTradeIdx,
	formatCurrencyWithSign,
	dateLocale,
	t,
	tCommon,
}: ReplayPhaseProps) => {
	const trade = trades[tradeIdx]
	if (!trade) {
		return <p className="text-txt-300">{t("noTrades")}</p>
	}

	const pct = ((tradeIdx + 1) / trades.length) * 100

	return (
		<div className="space-y-m-400">
			<div className="gap-s-200 flex items-center justify-between">
				<Button
					id="weekly-review-trade-prev"
					variant="ghost"
					size="sm"
					onClick={() => setTradeIdx(Math.max(0, tradeIdx - 1))}
					disabled={tradeIdx === 0}
				>
					<ChevronLeft className="h-4 w-4" aria-hidden />
					{tCommon("previous")}
				</Button>
				<span className="text-tiny text-txt-300">
					{tradeIdx + 1} / {trades.length}
				</span>
				<Button
					id="weekly-review-trade-next"
					variant="ghost"
					size="sm"
					onClick={() => setTradeIdx(Math.min(trades.length - 1, tradeIdx + 1))}
					disabled={tradeIdx === trades.length - 1}
				>
					{tCommon("next")}
					<ChevronRight className="h-4 w-4" aria-hidden />
				</Button>
			</div>

			<div className="bg-bg-300 h-1 overflow-hidden rounded-full">
				<div
					className="bg-acc-100 h-full transition-all"
					style={{ width: `${pct}%` }}
				/>
			</div>

			<div className="border-bg-300 bg-bg-100 p-m-400 rounded-md border">
				<div className="gap-s-200 flex flex-wrap items-center justify-between">
					<div className="gap-s-200 flex items-center">
						<Badge
							id={`weekly-review-trade-asset-${trade.id}`}
							variant="outline"
						>
							{trade.asset}
						</Badge>
						<Badge
							id={`weekly-review-trade-dir-${trade.id}`}
							variant="outline"
							className={cn(
								trade.direction === "long"
									? "text-trade-buy"
									: "text-trade-sell"
							)}
						>
							{trade.direction}
						</Badge>
						<span className="text-tiny text-txt-300">
							{format(parseISO(trade.entryDate), "EEE, MMM d HH:mm", {
								locale: dateLocale,
							})}
						</span>
					</div>
					<div className="gap-s-300 flex items-center">
						<span
							className={cn(
								"text-body font-semibold tabular-nums",
								trade.pnl >= 0 ? "text-trade-buy" : "text-trade-sell"
							)}
						>
							{formatCurrencyWithSign(trade.pnl)}
						</span>
						{trade.r !== null && (
							<span className="text-small text-txt-300">
								{trade.r.toFixed(2)}R
							</span>
						)}
					</div>
				</div>

				<div className="mt-m-400 gap-m-400 grid grid-cols-2 sm:grid-cols-4">
					<MiniStat label={t("trade.outcome")} value={trade.outcome ?? "—"} />
					<MiniStat label={t("trade.rating")} value={trade.rating ?? "—"} />
					<MiniStat
						label={t("trade.followedPlan")}
						value={
							trade.followedPlan === true
								? t("trade.yes")
								: trade.followedPlan === false
									? t("trade.no")
									: "—"
						}
						tone={trade.followedPlan === false ? "warn" : undefined}
					/>
					<MiniStat
						label={t("trade.mistakes")}
						value={
							trade.mistakeTags.length > 0 ? trade.mistakeTags.join(", ") : "—"
						}
						tone={trade.mistakeTags.length > 0 ? "warn" : undefined}
					/>
				</div>

				{(trade.lessonLearned ||
					trade.postTradeReflection ||
					trade.disciplineNotes) && (
					<div className="mt-m-400 space-y-s-300">
						{trade.lessonLearned && (
							<NoteBlock
								label={t("trade.lessonLearned")}
								text={trade.lessonLearned}
							/>
						)}
						{trade.postTradeReflection && (
							<NoteBlock
								label={t("trade.postTradeReflection")}
								text={trade.postTradeReflection}
							/>
						)}
						{trade.disciplineNotes && (
							<NoteBlock
								label={t("trade.disciplineNotes")}
								text={trade.disciplineNotes}
							/>
						)}
					</div>
				)}

				<div className="mt-m-400 border-bg-300 pt-s-300 border-t">
					<Link
						href={`/journal/${trade.id}`}
						className="text-small text-acc-100 hover:underline"
					>
						{t("trade.openInJournal")} →
					</Link>
				</div>
			</div>
		</div>
	)
}

const MiniStat = ({
	label,
	value,
	tone,
}: {
	label: string
	value: string
	tone?: "warn"
}) => (
	<div>
		<p className="text-tiny text-txt-300">{label}</p>
		<p
			className={cn(
				"text-small text-txt-100",
				tone === "warn" && "text-warning"
			)}
		>
			{value}
		</p>
	</div>
)

const NoteBlock = ({ label, text }: { label: string; text: string }) => (
	<div>
		<p className="text-tiny text-txt-300">{label}</p>
		<p className="text-small text-txt-100 whitespace-pre-wrap">{text}</p>
	</div>
)

// ────────────────────────────────────────────────────────────────────
// Phase 2 — Adherence
// ────────────────────────────────────────────────────────────────────

interface AdherencePhaseProps {
	adherence: WeeklyReviewPayload["adherence"]
	trades: WeeklyReviewPayload["trades"]
	t: ReturnType<typeof useTranslations>
	formatCurrencyWithSign: (_value: number) => string
}

const AdherencePhase = ({
	adherence,
	trades,
	t,
	formatCurrencyWithSign,
}: AdherencePhaseProps) => {
	const deviating = trades.filter((tr) =>
		adherence.deviatingTradeIds.includes(tr.id)
	)
	const rateTone =
		adherence.deviationRate >= 20
			? "text-fb-error"
			: adherence.deviationRate >= 10
				? "text-warning"
				: "text-trade-buy"

	return (
		<div className="space-y-m-400">
			<div className="gap-m-400 grid grid-cols-3">
				<div>
					<p className="text-tiny text-txt-300">
						{t("adherence.deviationRate")}
					</p>
					<p className={cn("text-h2 font-semibold tabular-nums", rateTone)}>
						{adherence.deviationRate.toFixed(0)}%
					</p>
				</div>
				<div>
					<p className="text-tiny text-txt-300">{t("adherence.followed")}</p>
					<p className="text-h2 text-trade-buy font-semibold tabular-nums">
						{adherence.followedCount}
					</p>
				</div>
				<div>
					<p className="text-tiny text-txt-300">{t("adherence.deviated")}</p>
					<p className="text-h2 text-trade-sell font-semibold tabular-nums">
						{adherence.deviatedCount}
					</p>
				</div>
			</div>

			{adherence.uncategorizedCount > 0 && (
				<p className="text-small text-txt-300">
					{t("adherence.uncategorized", {
						count: adherence.uncategorizedCount,
					})}
				</p>
			)}

			{deviating.length > 0 ? (
				<div>
					<h3 className="text-small text-txt-100 font-medium">
						{t("adherence.deviationsTitle")}
					</h3>
					<ul className="mt-s-300 space-y-s-200">
						{deviating.map((tr) => (
							<li
								key={tr.id}
								className="bg-bg-100 px-s-300 py-s-200 rounded-sm"
							>
								<div className="gap-s-200 flex items-center justify-between">
									<Link
										href={`/journal/${tr.id}`}
										className="text-small text-acc-100 hover:underline"
									>
										{tr.asset} · {tr.direction}
									</Link>
									<span
										className={cn(
											"text-small tabular-nums",
											tr.pnl >= 0 ? "text-trade-buy" : "text-trade-sell"
										)}
									>
										{formatCurrencyWithSign(tr.pnl)}
									</span>
								</div>
								{tr.disciplineNotes && (
									<p className="mt-s-100 text-tiny text-txt-300 whitespace-pre-wrap">
										{tr.disciplineNotes}
									</p>
								)}
							</li>
						))}
					</ul>
				</div>
			) : (
				<p className="text-small text-trade-buy">
					{t("adherence.noDeviations")}
				</p>
			)}
		</div>
	)
}

// ────────────────────────────────────────────────────────────────────
// Phase 3 — Metrics
// ────────────────────────────────────────────────────────────────────

interface MetricsPhaseProps {
	summary: WeeklyReviewPayload["summary"]
	dailyBreakdown: WeeklyReviewPayload["dailyBreakdown"]
	insights: WeeklyReviewPayload["insights"]
	formatCurrencyWithSign: (_value: number) => string
	dateLocale: Locale
	t: ReturnType<typeof useTranslations>
}

const MetricsPhase = ({
	summary,
	dailyBreakdown,
	insights,
	formatCurrencyWithSign,
	dateLocale,
	t,
}: MetricsPhaseProps) => (
	<div className="space-y-m-400">
		<div className="gap-m-400 grid grid-cols-2 sm:grid-cols-4">
			<KpiBlock
				label={t("metrics.netPnl")}
				value={formatCurrencyWithSign(summary.netPnl)}
				tone={summary.netPnl >= 0 ? "buy" : "sell"}
			/>
			<KpiBlock
				label={t("metrics.winRate")}
				value={`${summary.winRate.toFixed(0)}%`}
			/>
			<KpiBlock
				label={t("metrics.avgR")}
				value={summary.avgR.toFixed(2)}
				tone={summary.avgR >= 0 ? "buy" : "sell"}
			/>
			<KpiBlock
				label={t("metrics.profitFactor")}
				value={
					summary.profitFactor === 0 ? "—" : summary.profitFactor.toFixed(2)
				}
			/>
		</div>

		<div>
			<h3 className="text-small text-txt-100 font-medium">
				{t("metrics.dailyBreakdown")}
			</h3>
			<div className="mt-s-300 space-y-s-200">
				{dailyBreakdown.map((d) => (
					<div
						key={d.date}
						className="bg-bg-100 px-s-300 py-s-200 flex items-center justify-between rounded-sm"
					>
						<span className="text-small text-txt-200">
							{format(parseISO(d.date), "EEE, MMM d", { locale: dateLocale })}
						</span>
						<div className="gap-m-400 flex items-center">
							<span className="text-tiny text-txt-300">
								{d.tradeCount} · {d.winCount}W / {d.lossCount}L
							</span>
							<span
								className={cn(
									"text-small tabular-nums",
									d.pnl >= 0 ? "text-trade-buy" : "text-trade-sell"
								)}
							>
								{formatCurrencyWithSign(d.pnl)}
							</span>
						</div>
					</div>
				))}
			</div>
		</div>

		{insights.length > 0 && (
			<div>
				<h3 className="text-small text-txt-100 font-medium">
					{t("metrics.patternsTitle")}
				</h3>
				<ul className="mt-s-300 space-y-s-200">
					{insights.map((ins) => (
						<li
							key={ins.id}
							className={cn(
								"bg-bg-100 px-s-300 py-s-200 rounded-sm",
								ins.severity === "warning" && "border-warning/40 border-l-2"
							)}
						>
							<p className="text-small text-txt-100">
								{Object.entries(ins.params).reduce(
									(acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
									t.has(ins.titleKey) ? t(ins.titleKey) : ins.titleKey
								)}
							</p>
							<p className="text-tiny text-txt-300">
								{ins.category} · {Math.round(ins.confidence * 100)}%
							</p>
						</li>
					))}
				</ul>
			</div>
		)}
	</div>
)

const KpiBlock = ({
	label,
	value,
	tone,
}: {
	label: string
	value: string
	tone?: "buy" | "sell"
}) => (
	<div>
		<p className="text-tiny text-txt-300">{label}</p>
		<p
			className={cn(
				"text-h3 text-txt-100 font-semibold tabular-nums",
				tone === "buy" && "text-trade-buy",
				tone === "sell" && "text-trade-sell"
			)}
		>
			{value}
		</p>
	</div>
)

// ────────────────────────────────────────────────────────────────────
// Phase 4 — Mistakes
// ────────────────────────────────────────────────────────────────────

interface MistakesPhaseProps {
	mistakes: WeeklyReviewPayload["mistakes"]
	t: ReturnType<typeof useTranslations>
	formatCurrencyWithSign: (_value: number) => string
}

const MistakesPhase = ({
	mistakes,
	t,
	formatCurrencyWithSign,
}: MistakesPhaseProps) => {
	if (mistakes.length === 0) {
		return (
			<p className="text-small text-trade-buy">{t("mistakes.noneTagged")}</p>
		)
	}
	return (
		<div className="space-y-s-300">
			<p className="text-small text-txt-300">{t("mistakes.intro")}</p>
			<ul className="space-y-s-200">
				{mistakes.map((m) => (
					<li key={m.tagId} className="bg-bg-100 px-s-300 py-s-300 rounded-sm">
						<div className="gap-s-200 flex items-center justify-between">
							<div className="gap-s-200 flex items-center">
								{m.color && (
									<span
										className="h-2 w-2 rounded-full"
										style={{ backgroundColor: m.color }}
										aria-hidden
									/>
								)}
								<span className="text-small text-txt-100">{m.tagName}</span>
							</div>
							<div className="gap-s-300 flex items-center">
								<span className="text-tiny text-txt-300">
									{t("mistakes.weekCount", { n: m.weekCount })}
								</span>
								<span className="text-tiny text-txt-300">
									{t("mistakes.last90", { n: m.last90Count })}
								</span>
								<span className="text-small text-trade-sell tabular-nums">
									−{formatCurrencyWithSign(m.weekLossCents).replace("+", "")}
								</span>
							</div>
						</div>
					</li>
				))}
			</ul>
		</div>
	)
}

// ────────────────────────────────────────────────────────────────────
// Phase 5 — Risco (B3)
// ────────────────────────────────────────────────────────────────────

interface RiscoPhaseProps {
	risco: WeeklyReviewPayload["risco"]
	adherence: WeeklyReviewPayload["adherence"]
	t: ReturnType<typeof useTranslations>
	formatCurrencyWithSign: (_value: number) => string
	dateLocale: Locale
}

const RiscoPhase = ({
	risco,
	adherence,
	t,
	formatCurrencyWithSign,
	dateLocale,
}: RiscoPhaseProps) => {
	const flags: Array<{ key: string; label: string; tone: "warn" | "info" }> = []
	if (risco.hasConsecutiveLossDay) {
		flags.push({
			key: "consec",
			label: t("risco.consecutiveLosses", {
				n: risco.maxConsecutiveLossesInDay,
			}),
			tone: "warn",
		})
	}
	if (risco.worstDayDate) {
		flags.push({
			key: "worst",
			label: t("risco.worstDay", {
				date: format(parseISO(risco.worstDayDate), "EEE, MMM d", {
					locale: dateLocale,
				}),
				pnl: formatCurrencyWithSign(risco.worstDayPnl),
			}),
			tone: risco.worstDayPnl < 0 ? "warn" : "info",
		})
	}
	if (adherence.deviationRate >= 20) {
		flags.push({
			key: "dev",
			label: t("risco.highDeviation", {
				pct: adherence.deviationRate.toFixed(0),
			}),
			tone: "warn",
		})
	}

	if (flags.length === 0) {
		return <p className="text-small text-trade-buy">{t("risco.allClear")}</p>
	}

	return (
		<ul className="space-y-s-200">
			{flags.map((f) => (
				<li
					key={f.key}
					className={cn(
						"px-s-300 py-s-300 gap-s-200 flex items-start rounded-sm",
						f.tone === "warn"
							? "bg-warning/10 border-warning/40 border-l-2"
							: "bg-bg-100"
					)}
				>
					<ShieldAlert
						className={cn(
							"mt-s-100 h-4 w-4",
							f.tone === "warn" ? "text-warning" : "text-txt-300"
						)}
						aria-hidden
					/>
					<span className="text-small text-txt-100">{f.label}</span>
				</li>
			))}
		</ul>
	)
}

// ────────────────────────────────────────────────────────────────────
// Phase 6 — Forward
// ────────────────────────────────────────────────────────────────────

interface ForwardPhaseProps {
	lesson: string
	ruleChange: string
	focusNextWeek: string
	setLesson: (_value: string) => void
	setRuleChange: (_value: string) => void
	setFocusNextWeek: (_value: string) => void
	onSave: (_markCompleted: boolean) => void
	isPending: boolean
	t: ReturnType<typeof useTranslations>
	completedAt: string | null
}

const ForwardPhase = ({
	lesson,
	ruleChange,
	focusNextWeek,
	setLesson,
	setRuleChange,
	setFocusNextWeek,
	onSave,
	isPending,
	t,
	completedAt,
}: ForwardPhaseProps) => (
	<div className="space-y-m-400">
		<div className="space-y-s-200">
			<Label
				id="label-review-lesson"
				htmlFor="review-lesson"
				className="text-tiny text-txt-300"
			>
				{t("forward.lessonLabel")}
			</Label>
			<Textarea
				id="review-lesson"
				placeholder={t("forward.lessonHint")}
				rows={3}
				value={lesson}
				onChange={(e) => setLesson(e.target.value)}
				className="bg-bg-300 border-bg-300 text-small"
			/>
		</div>

		<div className="space-y-s-200">
			<Label
				id="label-review-rule"
				htmlFor="review-rule"
				className="text-tiny text-txt-300"
			>
				{t("forward.ruleChangeLabel")}
			</Label>
			<Textarea
				id="review-rule"
				placeholder={t("forward.ruleChangeHint")}
				rows={2}
				value={ruleChange}
				onChange={(e) => setRuleChange(e.target.value)}
				className="bg-bg-300 border-bg-300 text-small"
			/>
		</div>

		<div className="space-y-s-200">
			<Label
				id="label-review-focus"
				htmlFor="review-focus"
				className="text-tiny text-txt-300"
			>
				{t("forward.focusLabel")}
			</Label>
			<Textarea
				id="review-focus"
				placeholder={t("forward.focusHint")}
				rows={2}
				value={focusNextWeek}
				onChange={(e) => setFocusNextWeek(e.target.value)}
				className="bg-bg-300 border-bg-300 text-small"
			/>
		</div>

		<div className="gap-s-300 border-bg-300 pt-s-300 flex flex-wrap items-center justify-end border-t">
			<Button
				id="weekly-review-save-draft"
				variant="ghost"
				onClick={() => onSave(false)}
				disabled={isPending}
			>
				{isPending && (
					<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
				)}
				{t("forward.saveDraft")}
			</Button>
			<Button
				id="weekly-review-complete"
				onClick={() => onSave(true)}
				disabled={isPending}
			>
				{isPending && (
					<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
				)}
				{completedAt ? t("forward.resave") : t("forward.complete")}
			</Button>
		</div>

		{/* Visual cue for symmetry with metrics phase */}
		<div className="gap-s-200 text-tiny text-txt-300 flex items-center">
			<TrendingUp className="text-trade-buy h-3 w-3" aria-hidden />
			<span>{t("forward.footerHint")}</span>
			<TrendingDown className="text-trade-sell h-3 w-3" aria-hidden />
		</div>
	</div>
)

export { WeeklyReviewFlow }
