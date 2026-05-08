import { cn } from "@/lib/utils"

type DarfStatus =
	| "pending"
	| "paid"
	| "exempt"
	| "overdue"
	| "unknown"
	| "in_progress"
	| "future"

interface DarfStripChip {
	monthIndex: number // 0-11
	status: DarfStatus
	dueCents: number
}

interface DarfStripProps {
	chips: readonly DarfStripChip[]
	onChipClick?: (_monthIndex: number) => void
}

const MONTH_ABBR_PT = [
	"jan",
	"fev",
	"mar",
	"abr",
	"mai",
	"jun",
	"jul",
	"ago",
	"set",
	"out",
	"nov",
	"dez",
]

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

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const DarfStrip = ({ chips, onChipClick }: DarfStripProps) => {
	const byIndex = new Map(chips.map((c) => [c.monthIndex, c]))
	const interactive = typeof onChipClick === "function"
	return (
		<ol
			className="gap-s-200 grid grid-cols-6 sm:grid-cols-12"
			aria-label="DARF mensal — visão anual"
		>
			{Array.from({ length: 12 }, (_, i) => {
				const chip = byIndex.get(i) ?? {
					monthIndex: i,
					status: "unknown" as const,
					dueCents: 0,
				}
				const hasData = chip.status !== "unknown" && chip.status !== "future"
				const canClick = interactive && hasData
				const label = `${MONTH_ABBR_PT[i]} — ${STATUS_LABEL[chip.status]} — ${formatBRL(chip.dueCents)}`
				const showAmount =
					chip.status !== "exempt" &&
					chip.status !== "unknown" &&
					chip.status !== "future"
				const content = (
					<>
						<span className="text-micro text-txt-300 tracking-wide uppercase">
							{MONTH_ABBR_PT[i]}
						</span>
						<span
							className={cn("size-2 rounded-full", STATUS_DOT[chip.status])}
							aria-hidden="true"
						/>
						<span className="text-micro text-txt-200 font-mono tabular-nums">
							{showAmount ? formatBRL(chip.dueCents) : "—"}
						</span>
					</>
				)
				return (
					<li key={i}>
						{canClick ? (
							<button
								type="button"
								onClick={() => onChipClick(i)}
								className={cn(
									"gap-s-100 border-bg-300 bg-bg-200 px-s-200 py-s-200 flex w-full flex-col items-center rounded-sm border transition-colors",
									"hover:border-acc-100/40 focus-visible:ring-acc-100 cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
								)}
								aria-label={label}
							>
								{content}
							</button>
						) : (
							<div
								className={cn(
									"gap-s-100 border-bg-300 bg-bg-200 px-s-200 py-s-200 flex w-full flex-col items-center rounded-sm border"
								)}
								aria-label={label}
							>
								{content}
							</div>
						)}
					</li>
				)
			})}
		</ol>
	)
}

export { DarfStrip }
export type { DarfStripChip, DarfStatus, DarfStripProps }
