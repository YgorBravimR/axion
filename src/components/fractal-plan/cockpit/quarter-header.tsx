"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { QuarterPlanSlideover } from "./quarter-plan-slideover"

interface QuarterHeaderProps {
	year: number
	quarter: number
	locale: string
	quarterLabel: string
	monthRangeLabel: string
	quarterlyPlanId: string
	existing: {
		goalCents: number | null
		reflectionNotes: string | null
		postMortemNotes: string | null
	}
}

const adjacentQuarter = (year: number, quarter: number, delta: -1 | 1): { year: number; quarter: number } => {
	const next = quarter + delta
	if (next < 1) return { year: year - 1, quarter: 4 }
	if (next > 4) return { year: year + 1, quarter: 1 }
	return { year, quarter: next }
}

const QuarterHeader = ({
	year,
	quarter,
	locale,
	quarterLabel,
	monthRangeLabel,
	quarterlyPlanId,
	existing,
}: QuarterHeaderProps) => {
	const [editing, setEditing] = useState(false)
	const prev = adjacentQuarter(year, quarter, -1)
	const next = adjacentQuarter(year, quarter, 1)

	return (
		<>
			<header className="flex flex-wrap items-baseline justify-between gap-s-300">
				<nav className="flex items-center gap-s-300 text-small text-txt-300" aria-label="Navegação do trimestre">
					<Link
						href={`/${locale}/plan/${prev.year}/${prev.quarter}`}
						className="rounded-sm p-1 hover:bg-bg-200 hover:text-txt-100"
						aria-label="Trimestre anterior"
					>
						<ChevronLeft className="size-4" />
					</Link>
					<span className="text-tiny uppercase tracking-wider">
						<Link href={`/${locale}/plan/${year}`} className="hover:text-txt-100">
							{year}
						</Link>
					</span>
					<h1 className="text-h2 font-semibold text-txt-100">{quarterLabel}</h1>
					<span className="text-tiny text-txt-300">· {monthRangeLabel}</span>
					<Link
						href={`/${locale}/plan/${next.year}/${next.quarter}`}
						className="rounded-sm p-1 hover:bg-bg-200 hover:text-txt-100"
						aria-label="Próximo trimestre"
					>
						<ChevronRight className="size-4" />
					</Link>
				</nav>
				<Button
					id={`quarter-edit-${quarterlyPlanId}`}
					variant="ghost"
					size="sm"
					onClick={() => setEditing(true)}
					aria-label="Editar plano do trimestre"
				>
					<Pencil className="size-3.5" />
					Editar plano
				</Button>
			</header>

			<QuarterPlanSlideover
				open={editing}
				onOpenChange={setEditing}
				quarterLabel={quarterLabel}
				quarterlyPlanId={quarterlyPlanId}
				existing={existing}
			/>
		</>
	)
}

export { QuarterHeader }
export type { QuarterHeaderProps }
