import { formatCurrency } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n/config"
import type { YearTaxSummary } from "@/app/actions/tax-engine"

interface AnnualTaxSummaryProps {
	year: number
	summary: YearTaxSummary
	locale?: Locale
}

const AnnualTaxSummary = ({ year, summary, locale = "pt-BR" }: AnnualTaxSummaryProps) => {
	const fmt = (cents: number) => formatCurrency(cents / 100, locale, "BRL")

	const rows: Array<{ label: string; value: number; highlight?: boolean; muted?: boolean }> = [
		{ label: "Resultado Bruto",    value: summary.grossGainCents },
		{ label: "Total Taxas",        value: -summary.totalFeesCents, muted: true },
		{ label: "IRRF Retido",        value: -summary.totalIrrfCents, muted: true },
		{ label: "DARF Pago",          value: -summary.totalDarfPaidCents, muted: true },
		{ label: "DARF Pendente",      value: -summary.totalDarfPendingCents, muted: true },
		{ label: "Resultado Líquido",  value: summary.netLiquidCents, highlight: true },
	]

	return (
		<div className="space-y-4">
			<h3 className="text-sm font-semibold">Resumo Anual {year}</h3>

			<table className="w-full text-sm" aria-label={`Resumo fiscal ${year}`}>
				<tbody>
					{rows.map(({ label, value, highlight, muted }) => (
						<tr key={label} className="border-b border-border/40 last:border-0">
							<td className={cn("py-1.5", muted && "text-muted-foreground")}>{label}</td>
							<td
								className={cn(
									"py-1.5 text-right tabular-nums",
									highlight && "font-semibold",
									muted && "text-muted-foreground",
									!muted && value > 0 && "text-trade-buy",
									!muted && value < 0 && "text-trade-sell",
								)}
							>
								{fmt(value)}
							</td>
						</tr>
					))}
				</tbody>
			</table>

			{/* 30% heuristic gauge */}
			<div className="space-y-1">
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>Carga Fiscal sobre Resultado Bruto</span>
					<span className={cn(summary.heuristicWarning ? "text-destructive font-semibold" : "")}>
						{summary.irBurdenPercent.toFixed(1)}%
						{summary.heuristicWarning && " ⚠ acima de 30%"}
					</span>
				</div>
				<div
					className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
					role="progressbar"
					aria-valuenow={summary.irBurdenPercent}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div
						className={cn(
							"h-full rounded-full transition-all",
							summary.heuristicWarning ? "bg-destructive" : "bg-acc-100",
						)}
						style={{ width: `${Math.min(summary.irBurdenPercent, 100)}%` }}
					/>
				</div>
				<p className="text-xs text-muted-foreground">
					Referência da planilha: reservar 30% do bruto para IR + taxas.
				</p>
			</div>
		</div>
	)
}

export type { AnnualTaxSummaryProps }
export { AnnualTaxSummary }
