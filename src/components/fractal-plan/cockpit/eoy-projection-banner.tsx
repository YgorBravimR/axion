import { TrendingUp, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface EoyProjectionBannerProps {
	realEndBalanceCents: number
	projectedEoyBalanceCents: number
	initialCapitalCents: number
	totalRentPctEoy: number
	avgRPerDayYtd: number
	lastActualMonthIdx: number
}

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

const EoyProjectionBanner = ({
	realEndBalanceCents,
	projectedEoyBalanceCents,
	initialCapitalCents,
	totalRentPctEoy,
	avgRPerDayYtd,
	lastActualMonthIdx,
}: EoyProjectionBannerProps) => {
	const ytdRent = initialCapitalCents > 0
		? ((realEndBalanceCents - initialCapitalCents) / initialCapitalCents) * 100
		: 0
	const totalRentFromCapital = initialCapitalCents > 0
		? ((projectedEoyBalanceCents - initialCapitalCents) / initialCapitalCents) * 100
		: 0
	const lastMonthLabel = lastActualMonthIdx >= 0 ? MONTHS_PT[lastActualMonthIdx] : "—"

	return (
		<section
			id="plan-year-eoy-banner"
			aria-label="Projeção de fim de ano"
			className="mb-m-400 grid grid-cols-1 gap-m-400 rounded-md border border-bg-300 bg-bg-200 p-m-400 sm:grid-cols-4"
		>
			<div className="flex items-start gap-s-300">
				<div className="rounded-md bg-acc-100/15 p-s-200">
					<TrendingUp className="h-4 w-4 text-acc-100" aria-hidden="true" />
				</div>
				<div>
					<p className="text-tiny uppercase tracking-wide text-txt-300">YTD real (até {lastMonthLabel})</p>
					<p className="font-mono text-h3 tabular-nums text-txt-100">{formatBRL(realEndBalanceCents)}</p>
					<p className={cn(
						"font-mono text-tiny tabular-nums",
						ytdRent > 0 ? "text-profit" : ytdRent < 0 ? "text-loss" : "text-txt-300",
					)}>
						{ytdRent >= 0 ? "+" : ""}{ytdRent.toFixed(1)}%
					</p>
				</div>
			</div>

			<div className="flex items-start gap-s-300">
				<div className="rounded-md bg-guide/15 p-s-200">
					<Sparkles className="h-4 w-4 text-guide" aria-hidden="true" />
				</div>
				<div>
					<p className="text-tiny uppercase tracking-wide text-txt-300">Projeção EOY @ ritmo atual</p>
					<p className="font-mono text-h3 italic tabular-nums text-guide">{formatBRL(projectedEoyBalanceCents)}</p>
					<p className="font-mono text-tiny italic tabular-nums text-guide/80">
						+{totalRentFromCapital.toFixed(1)}% sobre capital inicial
					</p>
				</div>
			</div>

			<div>
				<p className="text-tiny uppercase tracking-wide text-txt-300">Ganho restante projetado</p>
				<p className="font-mono text-h3 tabular-nums text-txt-200">
					{formatBRL(projectedEoyBalanceCents - realEndBalanceCents)}
				</p>
				<p className="font-mono text-tiny tabular-nums text-txt-300">
					+{totalRentPctEoy.toFixed(1)}% sobre saldo atual
				</p>
			</div>

			<div>
				<p className="text-tiny uppercase tracking-wide text-txt-300">Ritmo (R/dia)</p>
				<p className="font-mono text-h3 tabular-nums text-txt-200">{avgRPerDayYtd.toFixed(2)}</p>
				<p className="text-tiny text-txt-300">média YTD por dia operado</p>
			</div>
		</section>
	)
}

export { EoyProjectionBanner }
export type { EoyProjectionBannerProps }
