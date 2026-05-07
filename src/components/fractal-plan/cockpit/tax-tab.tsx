"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { MonthlyDarfCard } from "@/components/tax/monthly-darf-card"
import { markDarfPaid, recomputeLedger } from "@/app/actions/tax-engine"
import { DarfStrip, type DarfStripChip } from "./darf-strip"
import type { MonthlyDarfRow } from "@/lib/tax/types"

interface TaxTabProps {
	accountId: string
	accountType: "personal" | "prop" | "replay"
	year: number
	rows: readonly MonthlyDarfRow[]
}

const TaxTab = ({ accountId, accountType, year, rows }: TaxTabProps) => {
	const router = useRouter()
	const { showToast } = useToast()
	const [isRecomputing, startRecompute] = useTransition()
	const [activeMonth, setActiveMonth] = useState<number | null>(null)
	const cardRefs = useRef<Map<number, HTMLDivElement | null>>(new Map())
	const isProp = accountType === "prop"

	const handleChipClick = (monthIndex: number) => {
		setActiveMonth(monthIndex)
		const node = cardRefs.current.get(monthIndex)
		if (node) {
			node.scrollIntoView({ behavior: "smooth", block: "center" })
		}
	}

	const chips: DarfStripChip[] = rows.map((r) => ({
		monthIndex: r.month.getMonth(),
		status: r.darfStatus,
		dueCents: r.darfDueCents,
	}))

	const handleMarkPaid = (monthIndex: number) => async (paidAmountCents: number) => {
		const result = await markDarfPaid({
			accountId,
			year,
			month: monthIndex + 1,
			paidAmountCents,
		})
		if (result.status === "success") {
			showToast("success", "DARF marcado como pago")
			router.refresh()
		} else {
			showToast("error", result.message)
		}
	}

	const handleRecomputeAll = () => {
		startRecompute(async () => {
			const result = await recomputeLedger({ accountId, fromYear: year, fromMonth: 1 })
			if (result.status === "success") {
				const n = result.data?.recomputedMonths ?? 0
				showToast("success", `Ledger recalculado · ${n} mês(es)`)
				router.refresh()
			} else {
				showToast("error", result.message)
			}
		})
	}

	return (
		<div className="space-y-m-400">
			<header className="flex items-center justify-between gap-s-300">
				<div>
					<h2 className="text-h3 text-txt-100">Impostos {year}</h2>
					<p className="text-small text-txt-300">DARF mensal — base 20% sobre lucro líquido</p>
				</div>
				<Button
					id={`tax-recompute-${year}`}
					variant="outline"
					size="sm"
					onClick={handleRecomputeAll}
					disabled={isRecomputing}
				>
					<RefreshCw className={isRecomputing ? "size-3.5 animate-spin" : "size-3.5"} />
					Recalcular ano
				</Button>
			</header>

			<DarfStrip chips={chips} onChipClick={handleChipClick} />

			<div className="grid grid-cols-1 gap-m-400 lg:grid-cols-2">
				{rows.map((row) => {
					const monthIndex = row.month.getMonth()
					const isOpen = activeMonth === monthIndex
					return (
						<div
							key={row.id}
							ref={(node) => {
								cardRefs.current.set(monthIndex, node)
							}}
						>
							<button
								type="button"
								onClick={() => setActiveMonth(isOpen ? null : monthIndex)}
								className="flex w-full items-center justify-between rounded-md border border-bg-300 bg-bg-200 px-m-400 py-s-300 text-left transition-colors hover:border-acc-100/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-100"
								aria-expanded={isOpen}
								aria-controls={`darf-panel-${monthIndex}`}
								id={`darf-trigger-${monthIndex}`}
							>
								<span className="font-mono text-small uppercase text-txt-200">
									{row.month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
								</span>
								<span className="font-mono text-small tabular-nums text-txt-200">
									DARF: {(row.darfDueCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
								</span>
							</button>
							{isOpen && (
								<div
									id={`darf-panel-${monthIndex}`}
									role="region"
									aria-labelledby={`darf-trigger-${monthIndex}`}
									className="mt-s-200"
								>
									<MonthlyDarfCard
										ledgerRow={row}
										onMarkPaid={handleMarkPaid(monthIndex)}
										isProp={isProp}
									/>
								</div>
							)}
						</div>
					)
				})}
				{rows.length === 0 && (
					<p className="rounded-md border border-dashed border-bg-300 bg-bg-200 px-m-400 py-m-500 text-center text-txt-300">
						Nenhuma linha de DARF para {year}. Clique em "Recalcular ano" após registrar trades.
					</p>
				)}
			</div>
		</div>
	)
}

export { TaxTab }
export type { TaxTabProps }
