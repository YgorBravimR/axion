import { cn } from "@/lib/utils"

type DarfStatus = "pending" | "paid" | "exempt" | "overdue" | "unknown"

interface DarfStripChip {
	monthIndex: number // 0-11
	status: DarfStatus
	dueCents: number
}

interface DarfStripProps {
	chips: readonly DarfStripChip[]
	onChipClick?: (monthIndex: number) => void
}

const MONTH_ABBR_PT = [
	"jan", "fev", "mar", "abr", "mai", "jun",
	"jul", "ago", "set", "out", "nov", "dez",
]

const STATUS_DOT: Record<DarfStatus, string> = {
	paid: "bg-fb-success",
	pending: "bg-warning",
	overdue: "bg-fb-error",
	exempt: "bg-txt-300",
	unknown: "bg-bg-300",
}

const STATUS_LABEL: Record<DarfStatus, string> = {
	paid: "Pago",
	pending: "Pendente",
	overdue: "Vencido",
	exempt: "Isento",
	unknown: "Sem dado",
}

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const DarfStrip = ({ chips, onChipClick }: DarfStripProps) => {
	const byIndex = new Map(chips.map((c) => [c.monthIndex, c]))
	const interactive = typeof onChipClick === "function"
	return (
		<ol
			className="grid grid-cols-6 gap-s-200 sm:grid-cols-12"
			aria-label="DARF mensal — visão anual"
		>
			{Array.from({ length: 12 }, (_, i) => {
				const chip = byIndex.get(i) ?? { monthIndex: i, status: "unknown" as const, dueCents: 0 }
				const hasData = chip.status !== "unknown"
				const canClick = interactive && hasData
				const label = `${MONTH_ABBR_PT[i]} — ${STATUS_LABEL[chip.status]} — ${formatBRL(chip.dueCents)}`
				const content = (
					<>
						<span className="text-micro uppercase tracking-wide text-txt-300">
							{MONTH_ABBR_PT[i]}
						</span>
						<span
							className={cn("size-2 rounded-full", STATUS_DOT[chip.status])}
							aria-hidden="true"
						/>
						<span className="font-mono text-micro tabular-nums text-txt-200">
							{chip.status === "exempt" || chip.status === "unknown"
								? "—"
								: formatBRL(chip.dueCents)}
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
									"flex w-full flex-col items-center gap-s-100 rounded-sm border border-bg-300 bg-bg-200 px-s-200 py-s-200 transition-colors",
									"hover:border-acc-100/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-100 cursor-pointer",
								)}
								aria-label={label}
							>
								{content}
							</button>
						) : (
							<div
								className={cn(
									"flex w-full flex-col items-center gap-s-100 rounded-sm border border-bg-300 bg-bg-200 px-s-200 py-s-200",
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
