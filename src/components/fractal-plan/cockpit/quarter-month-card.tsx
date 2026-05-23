import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { cn } from "@/lib/utils"
import { DarfStatusDot } from "@/components/ui/darf-status-dot"
import type { DarfStatus } from "@/components/ui/darf-status-dot"

interface QuarterMonthCardProps {
	href: string
	monthLabel: string
	state: "past" | "current" | "future"
	tierIndex: number
	oneRCents: number
	planGoalCents: number | null
	planGoalSource: "manual" | "weeks" | "default" | "none"
	realizedNetCents: number | null
	projectedNetCents: number | null
	darfStatus: DarfStatus
	darfDueCents: number
}

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	})

const QuarterMonthCard = async ({
	href,
	monthLabel,
	state,
	tierIndex,
	oneRCents,
	planGoalCents,
	planGoalSource,
	realizedNetCents,
	projectedNetCents,
	darfStatus,
	darfDueCents,
}: QuarterMonthCardProps) => {
	const t = await getTranslations("plan.quarter.monthCard")
	const realized = realizedNetCents ?? 0
	const realizedTone =
		realized > 0
			? "text-trade-buy"
			: realized < 0
				? "text-trade-sell"
				: "text-txt-200"
	const planSet = planGoalCents !== null && planGoalCents > 0
	const hitPct =
		planSet && realizedNetCents !== null
			? (realizedNetCents / planGoalCents!) * 100
			: null
	const showProjection = state === "current" && projectedNetCents !== null

	return (
		<Link
			href={href}
			className={cn(
				"group gap-s-300 bg-bg-200 p-m-400 flex flex-col rounded-lg border transition-colors",
				state === "current"
					? "border-acc-100/50 hover:border-acc-100"
					: state === "past"
						? "border-bg-300 hover:border-acc-100/40"
						: "border-bg-300/70 hover:border-guide/40 border-dashed"
			)}
			aria-label={t("openAriaLabel", { month: monthLabel })}
		>
			<header className="flex items-baseline justify-between">
				<h3 className="text-h3 text-txt-100 font-semibold">{monthLabel}</h3>
				<span className="text-tiny text-txt-300 font-mono">
					T{tierIndex} · 1R {formatBRL(oneRCents)}
				</span>
			</header>

			<dl className="gap-s-300 text-tiny grid grid-cols-2">
				<div>
					<dt className="text-txt-300">
						{t("meta")}
						{planGoalSource !== "none" && planGoalSource !== "manual" && (
							<span className="ml-s-100 bg-bg-100 px-s-100 text-micro text-txt-300 rounded-sm py-px uppercase">
								auto
							</span>
						)}
					</dt>
					<dd
						className={cn(
							"mt-s-100 font-mono tabular-nums",
							planSet
								? "text-small text-txt-100"
								: "text-tiny text-txt-placeholder"
						)}
					>
						{planSet ? formatBRL(planGoalCents!) : t("noGoal")}
					</dd>
				</div>
				<div>
					<dt className="text-txt-300">{t("realized")}</dt>
					<dd
						className={cn(
							"mt-s-100 font-mono tabular-nums",
							realizedNetCents === null
								? "text-tiny text-txt-placeholder"
								: cn("text-small", realizedTone)
						)}
					>
						{realizedNetCents === null ? "—" : formatBRL(realizedNetCents)}
					</dd>
				</div>
				{showProjection && (
					<div className="col-span-2">
						<dt className="text-txt-300">{t("projectedEndMonth")}</dt>
						<dd className="mt-s-100 text-small text-txt-100 font-mono tabular-nums">
							{formatBRL(projectedNetCents!)}
						</dd>
					</div>
				)}
				{hitPct !== null && (
					<div className="col-span-2">
						<dt className="sr-only">{t("hitRateLabel")}</dt>
						<dd>
							<div className="bg-bg-100 h-1 w-full overflow-hidden rounded-full">
								<div
									className="bg-proj h-full rounded-full"
									style={{ width: `${Math.min(100, Math.max(0, hitPct))}%` }}
									aria-hidden="true"
								/>
							</div>
							<p className="mt-s-100 text-micro text-txt-300">
								{t("hitRatePct", { pct: Math.round(hitPct) })}
							</p>
						</dd>
					</div>
				)}
			</dl>

			<footer className="border-bg-300/60 pt-s-200 flex items-center justify-between border-t">
				<div className="gap-s-200 text-micro text-txt-300 flex items-center">
					<DarfStatusDot status={darfStatus} />
					<span>
						{t("darfLabel", { status: t(`statusLabel.${darfStatus}`) })}
						{darfStatus !== "future" &&
							darfStatus !== "exempt" &&
							darfStatus !== "unknown" && (
								<span className="ml-s-100 font-mono tabular-nums">
									{formatBRL(darfDueCents)}
								</span>
							)}
					</span>
				</div>
				<ArrowRight
					className="text-txt-300 group-hover:text-acc-100 size-3.5 transition-colors"
					aria-hidden="true"
				/>
			</footer>
		</Link>
	)
}

export { QuarterMonthCard }
export type { QuarterMonthCardProps }
