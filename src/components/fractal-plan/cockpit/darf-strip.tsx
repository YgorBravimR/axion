"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { DarfStatusDot } from "@/components/ui/darf-status-dot"
import type { DarfStatus } from "@/components/ui/darf-status-dot"

// Re-export DarfStatus for backward compatibility
export type { DarfStatus }

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

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const DarfStrip = ({ chips, onChipClick }: DarfStripProps) => {
	const t = useTranslations("plan.darfStrip")
	const byIndex = new Map(chips.map((c) => [c.monthIndex, c]))
	const interactive = typeof onChipClick === "function"
	return (
		<ol
			className="gap-s-200 grid grid-cols-6 sm:grid-cols-12"
			aria-label={t("ariaLabel")}
		>
			{Array.from({ length: 12 }, (_, i) => {
				const chip = byIndex.get(i) ?? {
					monthIndex: i,
					status: "unknown" as const,
					dueCents: 0,
				}
				const hasData = chip.status !== "unknown" && chip.status !== "future"
				const canClick = interactive && hasData
				const statusLabel = t(`statusLabel.${chip.status}`)
				const monthAbbr = MONTH_ABBR_PT[i] ?? ""
				const label = t("chipAriaLabel", {
					month: monthAbbr,
					status: statusLabel,
					amount: formatBRL(chip.dueCents),
				})
				const showAmount =
					chip.status !== "exempt" &&
					chip.status !== "unknown" &&
					chip.status !== "future"
				const content = (
					<>
						<span className="text-micro text-txt-300 tracking-wide uppercase">
							{monthAbbr}
						</span>
						<DarfStatusDot status={chip.status} />
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
export type { DarfStripChip, DarfStripProps }
