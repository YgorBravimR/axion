"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { MonthlyPlanSlideover } from "./monthly-plan-slideover"
import type { RiskManagementProfile } from "@/types/risk-profile"

interface MonthHeaderProps {
	year: number
	quarter: number
	month: number
	locale: string
	monthLabel: string
	monthlyPlanId: string
	riskProfiles: RiskManagementProfile[]
	existing: {
		monthlyGoalCents: number | null
		intentNotes: string | null
		postMortemNotes: string | null
		overrideRiskProfileId: string | null
	}
}

const navHref = (locale: string, year: number, month: number): string => {
	const q = Math.ceil(month / 3)
	return `/${locale}/plan/${year}/${q}/${month}`
}

const computeAdjacent = (year: number, month: number, delta: -1 | 1): { year: number; month: number } => {
	const next = month + delta
	if (next < 1) return { year: year - 1, month: 12 }
	if (next > 12) return { year: year + 1, month: 1 }
	return { year, month: next }
}

const MonthHeader = ({
	year,
	quarter,
	month,
	locale,
	monthLabel,
	monthlyPlanId,
	riskProfiles,
	existing,
}: MonthHeaderProps) => {
	const [editing, setEditing] = useState(false)
	const prev = computeAdjacent(year, month, -1)
	const next = computeAdjacent(year, month, 1)

	return (
		<>
			<header className="flex flex-wrap items-baseline justify-between gap-s-300">
				<nav className="flex items-center gap-s-300 text-small text-txt-300" aria-label="Navegação do mês">
					<Link
						href={navHref(locale, prev.year, prev.month)}
						className="rounded-sm p-1 hover:bg-bg-200 hover:text-txt-100"
						aria-label="Mês anterior"
					>
						<ChevronLeft className="size-4" />
					</Link>
					<span className="text-tiny uppercase tracking-wider">
						<Link href={`/${locale}/plan/${year}`} className="hover:text-txt-100">
							{year}
						</Link>
						<span className="mx-s-100 text-bg-300">▸</span>
						<Link href={`/${locale}/plan/${year}/${quarter}`} className="hover:text-txt-100">
							Q{quarter}
						</Link>
					</span>
					<h1 className="text-h2 font-semibold text-txt-100">{monthLabel}</h1>
					<Link
						href={navHref(locale, next.year, next.month)}
						className="rounded-sm p-1 hover:bg-bg-200 hover:text-txt-100"
						aria-label="Próximo mês"
					>
						<ChevronRight className="size-4" />
					</Link>
				</nav>
				<Button
					id={`monthly-edit-${monthlyPlanId}`}
					variant="ghost"
					size="sm"
					onClick={() => setEditing(true)}
					aria-label="Editar plano do mês"
				>
					<Pencil className="size-3.5" />
					Editar plano
				</Button>
			</header>

			<MonthlyPlanSlideover
				open={editing}
				onOpenChange={setEditing}
				monthLabel={monthLabel}
				monthlyPlanId={monthlyPlanId}
				riskProfiles={riskProfiles}
				existing={existing}
			/>
		</>
	)
}

export { MonthHeader }
export type { MonthHeaderProps }
