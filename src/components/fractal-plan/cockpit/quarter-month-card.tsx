import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DarfStatus } from "./darf-strip"

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

const STATUS_DOT: Record<DarfStatus, string> = {
	paid: "bg-fb-success",
	pending: "bg-warning",
	overdue: "bg-fb-error",
	exempt: "bg-txt-300",
	unknown: "bg-bg-300",
	in_progress: "bg-action-buy",
	future: "bg-bg-400",
}

const STATUS_LABEL: Record<DarfStatus, string> = {
	paid: "Pago",
	pending: "Pendente",
	overdue: "Vencido",
	exempt: "Isento",
	unknown: "Sem dado",
	in_progress: "Em curso",
	future: "Futuro",
}

const QuarterMonthCard = ({
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
	const realized = realizedNetCents ?? 0
	const realizedTone =
		realized > 0 ? "text-trade-buy" : realized < 0 ? "text-trade-sell" : "text-txt-200"
	const planSet = planGoalCents != null && planGoalCents > 0
	const hitPct = planSet && realizedNetCents != null ? (realizedNetCents / planGoalCents!) * 100 : null
	const showProjection = state === "current" && projectedNetCents != null

	return (
		<Link
			href={href}
			className={cn(
				"group flex flex-col gap-s-300 rounded-lg border bg-bg-200 p-m-400 transition-colors",
				state === "current"
					? "border-acc-100/50 hover:border-acc-100"
					: state === "past"
						? "border-bg-300 hover:border-acc-100/40"
						: "border-dashed border-bg-300/70 hover:border-guide/40",
			)}
			aria-label={`Abrir plano de ${monthLabel}`}
		>
			<header className="flex items-baseline justify-between">
				<h3 className="text-h3 font-semibold text-txt-100">{monthLabel}</h3>
				<span className="font-mono text-tiny text-txt-300">T{tierIndex} · 1R {formatBRL(oneRCents)}</span>
			</header>

			<dl className="grid grid-cols-2 gap-s-300 text-tiny">
				<div>
					<dt className="text-txt-300">
						Meta
						{planGoalSource !== "none" && planGoalSource !== "manual" && (
							<span className="ml-s-100 rounded-sm bg-bg-100 px-s-100 py-px text-micro uppercase text-txt-300">
								auto
							</span>
						)}
					</dt>
					<dd
						className={cn(
							"mt-s-100 font-mono tabular-nums",
							planSet ? "text-small text-txt-100" : "text-tiny text-txt-placeholder",
						)}
					>
						{planSet ? formatBRL(planGoalCents!) : "Sem meta"}
					</dd>
				</div>
				<div>
					<dt className="text-txt-300">{state === "future" ? "Realizado" : "Realizado"}</dt>
					<dd
						className={cn(
							"mt-s-100 font-mono tabular-nums",
							realizedNetCents == null
								? "text-tiny text-txt-placeholder"
								: cn("text-small", realizedTone),
						)}
					>
						{realizedNetCents == null ? "—" : formatBRL(realizedNetCents)}
					</dd>
				</div>
				{showProjection && (
					<div className="col-span-2">
						<dt className="text-txt-300">Projeção fim mês</dt>
						<dd className="mt-s-100 font-mono text-small tabular-nums text-txt-100">
							{formatBRL(projectedNetCents!)}
						</dd>
					</div>
				)}
				{hitPct != null && (
					<div className="col-span-2">
						<dt className="sr-only">Hit rate</dt>
						<dd>
							<div className="h-1 w-full overflow-hidden rounded-full bg-bg-100">
								<div
									className="h-full rounded-full bg-guide"
									style={{ width: `${Math.min(100, Math.max(0, hitPct))}%` }}
									aria-hidden="true"
								/>
							</div>
							<p className="mt-s-100 text-micro text-txt-300">{Math.round(hitPct)}% da meta</p>
						</dd>
					</div>
				)}
			</dl>

			<footer className="flex items-center justify-between border-t border-bg-300/60 pt-s-200">
				<div className="flex items-center gap-s-200 text-micro text-txt-300">
					<span className={cn("size-2 rounded-full", STATUS_DOT[darfStatus])} aria-hidden="true" />
					<span>
						DARF {STATUS_LABEL[darfStatus]}
						{darfStatus !== "future" && darfStatus !== "exempt" && darfStatus !== "unknown" && (
							<span className="ml-s-100 font-mono tabular-nums">{formatBRL(darfDueCents)}</span>
						)}
					</span>
				</div>
				<ArrowRight className="size-3.5 text-txt-300 transition-colors group-hover:text-acc-100" />
			</footer>
		</Link>
	)
}

export { QuarterMonthCard }
export type { QuarterMonthCardProps }
