import { getTranslations } from "next-intl/server"
import { cn } from "@/lib/utils"

interface ComplianceCell {
	monthIndex: number
	followed: number
	rated: number
}

interface ComplianceRibbonProps {
	cells: readonly ComplianceCell[]
}

const MONTH_ABBR = [
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

const colorClassFor = (rated: number, followed: number): string => {
	if (rated === 0) {
		return "bg-bg-300/30 text-txt-300"
	}
	const pct = (followed / rated) * 100
	if (pct >= 80) {
		return "bg-trade-buy/15 text-trade-buy"
	}
	if (pct >= 60) {
		return "bg-warning/15 text-warning"
	}
	return "bg-trade-sell/15 text-trade-sell"
}

const ComplianceRibbon = async ({ cells }: ComplianceRibbonProps) => {
	const t = await getTranslations("plan.complianceRibbon")
	const byIndex = new Map(cells.map((c) => [c.monthIndex, c]))

	const totals = cells.reduce(
		(acc, c) => ({
			followed: acc.followed + c.followed,
			rated: acc.rated + c.rated,
		}),
		{ followed: 0, rated: 0 }
	)
	const totalPct =
		totals.rated > 0 ? Math.round((totals.followed / totals.rated) * 100) : null

	return (
		<section
			aria-label={t("ariaLabel")}
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 mb-s-300 sm:mb-m-400 rounded-lg border"
		>
			<div className="mb-s-300 flex items-center justify-between">
				<div>
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("title")}
					</h3>
					<p className="text-tiny text-txt-300">{t("description")}</p>
				</div>
				<div className="text-right">
					<div className="text-h3 text-txt-100 font-bold tabular-nums">
						{totalPct === null ? "—" : `${totalPct}%`}
					</div>
					<div className="text-tiny text-txt-300">
						{t("ytdLabel", {
							followed: totals.followed,
							rated: totals.rated,
						})}
					</div>
				</div>
			</div>
			<ol className="gap-s-200 grid grid-cols-6 sm:grid-cols-12">
				{Array.from({ length: 12 }, (_, i) => {
					const cell = byIndex.get(i) ?? {
						monthIndex: i,
						followed: 0,
						rated: 0,
					}
					const pct =
						cell.rated > 0
							? Math.round((cell.followed / cell.rated) * 100)
							: null
					const color = colorClassFor(cell.rated, cell.followed)
					return (
						<li key={i}>
							<div
								className={cn(
									"gap-s-100 px-s-200 py-s-200 flex w-full flex-col items-center rounded-sm",
									color
								)}
								aria-label={t("cellAriaLabel", {
									month: MONTH_ABBR[i] ?? "",
									pct: pct ?? 0,
									rated: cell.rated,
								})}
							>
								<span className="text-micro tracking-wide uppercase opacity-70">
									{MONTH_ABBR[i] ?? ""}
								</span>
								<span className="text-small font-semibold tabular-nums">
									{pct === null ? "—" : `${pct}%`}
								</span>
							</div>
						</li>
					)
				})}
			</ol>
		</section>
	)
}

export { ComplianceRibbon }
export type { ComplianceCell, ComplianceRibbonProps }
