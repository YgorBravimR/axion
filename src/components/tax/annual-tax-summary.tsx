import { getTranslations } from "next-intl/server"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n/config"
import type { YearTaxSummary } from "@/lib/tax/types"

interface AnnualTaxSummaryProps {
	year: number
	summary: YearTaxSummary
	locale?: Locale
}

const AnnualTaxSummary = async ({
	year,
	summary,
	locale = "pt-BR",
}: AnnualTaxSummaryProps) => {
	const t = await getTranslations("tax.annualSummary")
	const fmt = (cents: number) => formatCurrency(cents / 100, locale, "BRL")

	const rows: Array<{
		label: string
		value: number
		highlight?: boolean
		muted?: boolean
	}> = [
		{ label: t("rows.grossGain"), value: summary.grossGainCents },
		{ label: t("rows.totalFees"), value: -summary.totalFeesCents, muted: true },
		{
			label: t("rows.irrfWithheld"),
			value: -summary.totalIrrfCents,
			muted: true,
		},
		{
			label: t("rows.darfPaid"),
			value: -summary.totalDarfPaidCents,
			muted: true,
		},
		{
			label: t("rows.darfPending"),
			value: -summary.totalDarfPendingCents,
			muted: true,
		},
		{
			label: t("rows.netResult"),
			value: summary.netLiquidCents,
			highlight: true,
		},
	]

	return (
		<div className="space-y-4">
			<h3 className="text-sm font-semibold">{t("title", { year })}</h3>

			<Table aria-label={t("tableAriaLabel", { year })}>
				<TableBody>
					{rows.map(({ label, value, highlight, muted }) => (
						<TableRow key={label}>
							<TableCell className={cn(muted && "text-txt-300")}>
								{label}
							</TableCell>
							<TableCell
								className={cn(
									"text-right tabular-nums",
									highlight && "font-semibold",
									muted && "text-txt-300",
									!muted && value > 0 && "text-trade-buy",
									!muted && value < 0 && "text-trade-sell"
								)}
							>
								{fmt(value)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

			{/* 30% heuristic gauge */}
			<div className="space-y-1">
				<div className="text-muted-foreground flex items-center justify-between text-xs">
					<span>{t("burden.label")}</span>
					<span
						className={cn(
							summary.heuristicWarning ? "text-destructive font-semibold" : ""
						)}
					>
						{summary.irBurdenPercent.toFixed(1)}%
						{summary.heuristicWarning && ` ⚠ ${t("burden.warningAbove30")}`}
					</span>
				</div>
				<div
					className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
					role="progressbar"
					aria-valuenow={summary.irBurdenPercent}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div
						className={cn(
							"h-full rounded-full transition-all",
							summary.heuristicWarning ? "bg-destructive" : "bg-acc-100"
						)}
						style={{ width: `${Math.min(summary.irBurdenPercent, 100)}%` }}
					/>
				</div>
				<p className="text-muted-foreground text-xs">{t("burden.reference")}</p>
			</div>
		</div>
	)
}

export type { AnnualTaxSummaryProps }
export { AnnualTaxSummary }
