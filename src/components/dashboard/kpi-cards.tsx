import type { OverallStats, DisciplineData } from "@/types"
import {
	PnlCard,
	WinRateCard,
	ProfitFactorCard,
	AvgRCard,
	DisciplineCard,
} from "./kpi"

interface KpiCardsProps {
	stats: OverallStats | null
	discipline: DisciplineData | null
}

/**
 * Thin orchestrator that renders the KPI grid with hierarchy:
 * P&L is the hero (full-width, lg size), other 4 KPIs are secondary stats below.
 */
const KpiCards = ({ stats, discipline }: KpiCardsProps) => {
	return (
		<div className="gap-s-300 sm:gap-m-400 lg:gap-m-500 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 [&>*]:min-w-0 [&>*]:min-h-[7rem]">
			<PnlCard
				grossPnl={stats?.grossPnl ?? null}
				size="lg"
				className="col-span-2 sm:col-span-4"
			/>
			<WinRateCard
				winRate={stats?.winRate ?? null}
				winCount={stats?.winCount ?? null}
				lossCount={stats?.lossCount ?? null}
				breakevenCount={stats?.breakevenCount ?? null}
			/>
			<ProfitFactorCard
				profitFactor={stats?.profitFactor ?? null}
				avgWin={stats?.avgWin ?? null}
				avgLoss={stats?.avgLoss ?? null}
			/>
			<AvgRCard averageR={stats?.averageR ?? null} />
			<DisciplineCard discipline={discipline} />
		</div>
	)
}

export { KpiCards }
