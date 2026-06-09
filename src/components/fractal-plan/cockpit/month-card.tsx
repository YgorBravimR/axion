"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { useFormatting } from "@/hooks/use-formatting"
import { MonthCapitalPopover } from "./month-capital-popover"
import type { ProjectMonthResult } from "@/lib/fractal-plan/projection"

interface WeekData {
	isoWeek: number
	targetR: number | null
	actualR: number | null
}

interface RealMonthSnapshot {
	monthIndex: number
	tradesCount: number
	realPnlCents: number
	realRSum: number
	tradingDaysWithTrades: number
	weeklyR: { isoWeek: number; sumR: number }[]
}

interface PaceData {
	endBalanceCents: number
	oneRCents: number
	netLiquidCents: number
	grossPnlCents: number
}

interface RemainderData {
	addedRsum: number
	addedNetCents: number
	projectedEndBalanceCents: number
}

interface MonthCardProps {
	year: number
	monthIndex: number
	monthLabel: string
	href: string
	monthlyPlanId: string | null
	startBalanceCents: number
	endBalanceCents: number
	oneRCents: number
	tierIndex: number
	weeks: WeekData[]
	projection: ProjectMonthResult
	state: "past" | "current" | "future" | "muted" | "projection"
	prevMonthEndCents: number | null
	withdrawalCents?: number
	real: RealMonthSnapshot | null
	pace: PaceData | null
	remainder: RemainderData | null
	guideAnchor?: boolean
}

const formatPctSigned = (n: number): string =>
	`${n >= 0 ? "+" : ""}${n.toFixed(1)}%`

interface BarSpec {
	key: string
	rValue: number
	kind: "real" | "projection"
}

const buildBars = (
	weeks: WeekData[],
	state: MonthCardProps["state"],
	real: RealMonthSnapshot | null,
	projection: ProjectMonthResult,
	pace: PaceData | null,
	remainder: RemainderData | null
): BarSpec[] => {
	if (real && real.weeklyR.length > 0) {
		const realBars: BarSpec[] = real.weeklyR.map((w) => ({
			key: `r-${w.isoWeek}`,
			rValue: w.sumR,
			kind: "real" as const,
		}))
		if (remainder && remainder.addedRsum > 0) {
			realBars.push({
				key: "r-remainder",
				rValue: remainder.addedRsum,
				kind: "projection" as const,
			})
		}
		return realBars
	}
	if (
		weeks.length > 0 &&
		weeks.some((w) => (w.actualR ?? w.targetR) !== null)
	) {
		return weeks.map((w, i) => ({
			key: `w-${w.isoWeek}-${i}`,
			rValue:
				state === "past" ? (w.actualR ?? w.targetR ?? 0) : (w.targetR ?? 0),
			kind:
				state === "past" || state === "current"
					? ("real" as const)
					: ("projection" as const),
		}))
	}
	// Pace projection: synthesize 4 even bars from pace gross / 4
	if (pace && pace.oneRCents > 0) {
		const paceR = pace.grossPnlCents / pace.oneRCents
		const perWeek = paceR / 4
		return Array.from({ length: 4 }, (_, i) => ({
			key: `pp-${i}`,
			rValue: perWeek,
			kind: "projection" as const,
		}))
	}
	const projectedR = projection.totalTargetR
	if (projectedR > 0) {
		const perWeek = projectedR / 4
		return Array.from({ length: 4 }, (_, i) => ({
			key: `p-${i}`,
			rValue: perWeek,
			kind: "projection" as const,
		}))
	}
	return []
}

const MonthCard = ({
	monthLabel,
	href,
	monthlyPlanId,
	startBalanceCents,
	endBalanceCents,
	oneRCents,
	tierIndex,
	weeks,
	projection,
	state,
	prevMonthEndCents,
	withdrawalCents,
	real,
	pace,
	remainder,
	guideAnchor = false,
}: MonthCardProps) => {
	const t = useTranslations("plan.month")
	const { formatCurrency } = useFormatting()

	const formatBRL = (cents: number): string => formatCurrency(cents / 100)

	const formatBRLCompact = (cents: number): string => {
		const abs = Math.abs(cents / 100)
		if (abs >= 1000) {
			return `${cents < 0 ? "-" : ""}R$ ${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`
		}
		return formatBRL(cents)
	}
	if (state === "muted") {
		return (
			<div
				aria-label={`${monthLabel} — ${t("beforeAccountOpen")}`}
				className="border-bg-300/50 bg-bg-200/40 p-m-400 flex h-full flex-col rounded-md border border-dashed opacity-60"
				data-state="muted"
				data-testid={`month-card-${monthLabel}`}
			>
				<header className="gap-s-200 flex items-baseline justify-between">
					<h3 className="text-h3 text-txt-300 capitalize">{monthLabel}</h3>
					<span className="text-tiny text-txt-300">—</span>
				</header>
				<p className="mt-s-300 text-tiny text-txt-300">
					{t("beforeAccountOpen")}
				</p>
			</div>
		)
	}

	const isProjection = state === "projection"
	const hasRemainder = remainder !== null && remainder.addedRsum > 0

	const realOnlyEndCents = real ? startBalanceCents + real.realPnlCents : null
	const heroEndCents =
		hasRemainder && realOnlyEndCents !== null
			? realOnlyEndCents
			: endBalanceCents
	const deltaCents = heroEndCents - startBalanceCents
	const deltaPct =
		startBalanceCents > 0 ? (deltaCents / startBalanceCents) * 100 : 0

	const projectedTotalDeltaCents = endBalanceCents - startBalanceCents
	const projectedTotalDeltaPct =
		startBalanceCents > 0
			? (projectedTotalDeltaCents / startBalanceCents) * 100
			: 0

	const realRSum = real?.realRSum ?? 0
	const monthlyR = real
		? realRSum
		: pace
			? pace.grossPnlCents / Math.max(1, pace.oneRCents)
			: projection.totalTargetR
	const monthlyNetCents = real
		? real.realPnlCents
		: pace
			? pace.netLiquidCents
			: projection.projectedNetLiquidCents

	const bars = buildBars(weeks, state, real, projection, pace, remainder)
	const maxAbsR = bars.reduce((acc, b) => Math.max(acc, Math.abs(b.rValue)), 0)

	const guideId = guideAnchor
		? state === "current"
			? "plan-year-month-card-current"
			: state === "projection"
				? "plan-year-month-card-projection"
				: state === "past"
					? "plan-year-month-card-real"
					: undefined
		: undefined

	return (
		<div
			id={guideId}
			className={cn("group relative h-full", isProjection && "opacity-85")}
			data-testid={`month-card-${monthLabel}`}
		>
			{monthlyPlanId && (
				<MonthCapitalPopover
					monthlyPlanId={monthlyPlanId}
					monthLabel={monthLabel}
					currentCapitalCents={startBalanceCents}
					prevMonthEndCents={prevMonthEndCents}
				/>
			)}
			<Link
				href={href}
				className={cn(
					"gap-s-300 bg-bg-200 p-m-400 flex h-full flex-col overflow-hidden rounded-md border transition-colors",
					"focus-visible:ring-acc-100 focus-visible:ring-offset-bg-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
					state === "current" &&
						"border-l-acc-100 border-y-bg-300 border-r-bg-300 hover:border-r-acc-100/40 border-l-4",
					state === "past" && "border-bg-300 hover:border-acc-100/40",
					state === "future" && "border-bg-300 hover:border-acc-100/30",
					state === "projection" &&
						"border-bg-300/70 hover:border-acc-100/30 border-dashed"
				)}
				data-state={state}
			>
				<header className="gap-s-200 pr-m-400 flex items-start justify-between">
					<h3
						className={cn(
							"text-h3 capitalize",
							state === "current"
								? "text-txt-100"
								: isProjection
									? "text-txt-300"
									: "text-txt-200"
						)}
					>
						{monthLabel}
					</h3>
					<span className="text-txt-300 text-tiny font-mono">
						T{tierIndex + 1}
					</span>
				</header>

				<div className="gap-s-100 flex flex-col">
					<p className="text-tiny text-txt-300 tracking-wide uppercase">
						{t("finalBalance")}
					</p>
					<div className="gap-s-200 flex items-baseline justify-between">
						<span
							className={cn(
								"text-h2 font-mono tabular-nums",
								isProjection ? "text-proj italic" : "text-txt-100"
							)}
						>
							{formatBRL(heroEndCents)}
						</span>
						<span
							className={cn(
								"px-s-200 text-tiny rounded-sm py-px font-mono tabular-nums",
								deltaCents > 0 &&
									(isProjection
										? "bg-proj/10 text-proj italic"
										: "bg-profit/10 text-profit"),
								deltaCents < 0 && "bg-loss/10 text-loss",
								deltaCents === 0 && "bg-bg-300 text-txt-300"
							)}
						>
							{formatPctSigned(deltaPct)}
						</span>
					</div>
					<p className="text-tiny text-txt-300 font-mono tabular-nums">
						{t("from", { balance: formatBRLCompact(startBalanceCents) })}
					</p>
					{hasRemainder && (
						<p className="mt-s-100 gap-s-200 text-tiny text-proj flex items-center justify-between font-mono italic tabular-nums">
							<span>
								{t("projectedEndMonth", {
									balance: formatBRLCompact(endBalanceCents),
								})}
							</span>
							<span>{formatPctSigned(projectedTotalDeltaPct)}</span>
						</p>
					)}
				</div>

				{bars.length > 0 && (
					<div
						className="gap-s-100 flex min-h-0 flex-1 items-end"
						aria-hidden="true"
					>
						{bars.map((b) => {
							const heightPct =
								maxAbsR > 0
									? Math.max(8, (Math.abs(b.rValue) / maxAbsR) * 100)
									: 0
							const isPositive = b.rValue >= 0
							const isReal = b.kind === "real"
							return (
								<div
									key={b.key}
									className="flex flex-1 flex-col items-stretch justify-end"
								>
									<div className="relative h-full w-full">
										<div
											className={cn(
												"absolute right-0 left-0 rounded-sm transition-all",
												isPositive ? "bottom-1/2" : "top-1/2",
												!isReal && "border border-dashed",
												isReal && isPositive && "bg-profit/70",
												isReal && !isPositive && "bg-loss/70",
												!isReal && isPositive && "border-proj/60 bg-proj/15",
												!isReal && !isPositive && "border-loss/60 bg-loss/10"
											)}
											style={{ height: `${heightPct / 2}%` }}
										/>
										<div className="bg-bg-300/60 absolute top-1/2 right-0 left-0 h-px" />
									</div>
								</div>
							)
						})}
					</div>
				)}

				<dl className="gap-s-200 border-bg-300 pt-s-300 text-tiny grid grid-cols-3 border-t">
					<div>
						<dt className="text-txt-300">{real ? t("rReal") : t("rTarget")}</dt>
						<dd
							className={cn(
								"mt-px font-mono tabular-nums",
								monthlyR > 0 &&
									(real
										? "text-profit"
										: isProjection
											? "text-proj italic"
											: "text-txt-200"),
								monthlyR < 0 && "text-loss",
								monthlyR === 0 && "text-txt-200"
							)}
						>
							{monthlyR >= 0 ? "+" : ""}
							{monthlyR.toFixed(1)}R
						</dd>
					</div>
					<div>
						<dt className="text-txt-300">1R</dt>
						<dd className="text-txt-200 mt-px font-mono tabular-nums">
							{formatBRLCompact(oneRCents)}
						</dd>
					</div>
					<div>
						<dt className="text-txt-300">
							{real ? t("liqReal") : t("liqProj")}
						</dt>
						<dd
							className={cn(
								"mt-px font-mono tabular-nums",
								isProjection && "text-proj italic",
								!isProjection && monthlyNetCents > 0 && "text-profit",
								!isProjection && monthlyNetCents < 0 && "text-loss",
								!isProjection && monthlyNetCents === 0 && "text-txt-200"
							)}
						>
							{formatBRLCompact(monthlyNetCents)}
						</dd>
					</div>
					{hasRemainder && (
						<div className="mt-s-100 border-bg-300/50 pt-s-200 text-tiny text-proj col-span-3 flex items-center justify-between border-t font-mono italic tabular-nums">
							<dt className="text-txt-300 not-italic">{t("projRemainder")}</dt>
							<dd>
								{(remainder?.addedRsum ?? 0) >= 0 ? "+" : ""}
								{(remainder?.addedRsum ?? 0).toFixed(1)}R
								<span className="mx-s-100 text-txt-300">·</span>
								{formatBRLCompact(remainder?.addedNetCents ?? 0)}
							</dd>
						</div>
					)}
					{withdrawalCents != null && (
						<div className="border-bg-300/50 pt-s-200 col-span-3 flex items-center justify-between border-t">
							<dt className="text-txt-300">{t("projectedWithdrawal")}</dt>
							<dd className="text-proj font-mono tabular-nums">
								{formatBRLCompact(withdrawalCents)}
							</dd>
						</div>
					)}
				</dl>
			</Link>
		</div>
	)
}

export { MonthCard }
export type { MonthCardProps, WeekData, RealMonthSnapshot }
