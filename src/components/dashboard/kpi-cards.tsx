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
 * Thin orchestrator that renders 5 KPI cards in a responsive grid.
 * Each card is a standalone client component; this file stays a server component.
 */
const KpiCards = ({ stats, discipline }: KpiCardsProps) => {
	return (
		<div className="gap-s-300 sm:gap-m-400 lg:gap-m-500 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 [&>*]:h-32 [&>*]:min-w-0">
			<PnlCard grossPnl={stats?.grossPnl ?? null} />
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
