"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"

interface PayoffMatrixTabProps {
	initialCapitalCents: number
	tradingDaysPerWeek: number
	currentOneRCents: number
}

const WIN_RATES = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7] as const
const R_MULTIPLES = [1.0, 1.5, 2.0, 2.5, 3.0] as const

const expectedRPerTrade = (winRate: number, rMultiple: number): number =>
	winRate * rMultiple - (1 - winRate)

const formatBrl = (cents: number): string => {
	const value = cents / 100
	const abs = Math.abs(value)
	if (abs >= 1_000_000) {
		return `R$${(value / 1_000_000).toFixed(2)}M`
	}
	if (abs >= 1_000) {
		return `R$${(value / 1_000).toFixed(1)}k`
	}
	return `R$${value.toFixed(0)}`
}

const PayoffMatrixTab = ({
	initialCapitalCents,
	tradingDaysPerWeek,
	currentOneRCents,
}: PayoffMatrixTabProps) => {
	const t = useTranslations("plan.payoff")
	const [tradesPerDay, setTradesPerDay] = useState<1 | 2 | 3>(1)

	const weeksPerYear = 52
	const tradesPerYear = tradingDaysPerWeek * weeksPerYear * tradesPerDay

	const cells = useMemo(() => {
		return WIN_RATES.map((wr) =>
			R_MULTIPLES.map((rMul) => {
				const expR = expectedRPerTrade(wr, rMul)
				const annualR = expR * tradesPerYear
				const annualCents = Math.round(annualR * currentOneRCents)
				const rentPct =
					initialCapitalCents > 0
						? (annualCents / initialCapitalCents) * 100
						: 0
				return { wr, rMul, expR, annualR, annualCents, rentPct }
			})
		)
	}, [tradesPerYear, currentOneRCents, initialCapitalCents])

	const cellTone = (annualR: number): string => {
		if (annualR < 0) {
			return "bg-trade-sell/10 text-trade-sell"
		}
		if (annualR === 0) {
			return "bg-bg-200 text-txt-300"
		}
		if (annualR < 50) {
			return "bg-trade-buy/5 text-txt-200"
		}
		if (annualR < 150) {
			return "bg-trade-buy/15 text-txt-100"
		}
		return "bg-trade-buy/30 text-trade-buy"
	}

	return (
		<div className="space-y-m-400 mt-m-400">
			<header className="space-y-s-200">
				<h3 className="text-body text-txt-100 font-semibold">{t("title")}</h3>
				<p className="text-tiny text-txt-300">
					{t("subtitle", {
						tradesPerYear,
						oneR: formatBrl(currentOneRCents),
					})}
				</p>
			</header>

			<div className="gap-s-300 flex items-center">
				<label
					htmlFor="payoff-trades-per-day"
					className="text-tiny text-txt-200"
				>
					{t("tradesPerDayLabel")}
				</label>
				<div
					id="payoff-trades-per-day"
					role="radiogroup"
					aria-label={t("tradesPerDayLabel")}
					className="gap-s-100 flex"
				>
					{([1, 2, 3] as const).map((n) => (
						<button
							key={n}
							type="button"
							role="radio"
							aria-checked={tradesPerDay === n}
							onClick={() => setTradesPerDay(n)}
							className={`text-tiny px-s-300 py-s-100 rounded-md border ${
								tradesPerDay === n
									? "border-acc-100 bg-acc-100/20 text-txt-100"
									: "border-bg-300 bg-bg-200 text-txt-200"
							}`}
						>
							{n}
						</button>
					))}
				</div>
			</div>

			<div className="border-bg-300 rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow className="bg-bg-200">
							<TableHead className="border-bg-300 border-r">
								{t("winRateHeader")}
							</TableHead>
							{R_MULTIPLES.map((r) => (
								<TableHead key={r} className="text-center">
									{r.toFixed(1)}R
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{cells.map((row, i) => {
							const wr = WIN_RATES[i]!
							return (
								<TableRow key={wr}>
									<TableCell
										scope="row"
										className="text-tiny text-txt-200 border-bg-300 bg-bg-200 border-r font-medium"
									>
										{(wr * 100).toFixed(0)}%
									</TableCell>
									{row.map((cell) => (
										<TableCell
											key={`${cell.wr}-${cell.rMul}`}
											className={`text-center ${cellTone(cell.annualR)}`}
											title={t("cellTitle", {
												wr: (cell.wr * 100).toFixed(0),
												rMul: cell.rMul.toFixed(1),
												expR: cell.expR.toFixed(2),
												annualR: cell.annualR.toFixed(0),
												rentPct: cell.rentPct.toFixed(0),
											})}
										>
											<div className="text-small font-mono font-semibold">
												{cell.annualR >= 0 ? "+" : ""}
												{cell.annualR.toFixed(0)}R
											</div>
											<div className="text-tiny opacity-70">
												{cell.rentPct >= 0 ? "+" : ""}
												{cell.rentPct.toFixed(0)}%
											</div>
										</TableCell>
									))}
								</TableRow>
							)
						})}
					</TableBody>
				</Table>
			</div>

			<p className="text-tiny text-txt-300">{t("disclaimer")}</p>
		</div>
	)
}

export { PayoffMatrixTab }
