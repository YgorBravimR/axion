import { memo } from "react"
import type { OverallStats, DisciplineData, EquityPoint } from "@/types"
import {
	PnlCard,
	WinRateCard,
	ProfitFactorCard,
	AvgRCard,
	DisciplineCard,
	CapitalCard,
} from "./kpi"

interface KpiCardsProps {
	stats: OverallStats | null
	discipline: DisciplineData | null
	/**
	 * Sum of starting balances across the accounts in scope, in cents.
	 * All-time — independent of the period toggle.
	 */
	initialCapitalCents: number
	/**
	 * All-time net P&L in BRL (not cents). Used together with
	 * initialCapitalCents to compute "Capital Atual" (current balance).
	 * Bound to the server-rendered initial stats so it survives period toggles.
	 */
	allTimeNetPnl: number
	/**
	 * Cumulative equity series used to render a sparkline behind the P&L card.
	 * Bound to the server-rendered initial equity curve so the sparkline
	 * survives period toggles and represents the lifetime arc.
	 */
	equityCurve?: EquityPoint[]
}

/**
 * Dense single-row KPI strip (Tradezella-style): P&L (with sparkline) +
 * Capital (current with initial sub) + 4 secondary KPIs. No hero card,
 * no full-width spans — every slot earns its width.
 */
const KpiCardsImpl = ({
	stats,
	discipline,
	initialCapitalCents,
	allTimeNetPnl,
	equityCurve,
}: KpiCardsProps) => {
	const currentCapitalCents =
		initialCapitalCents + Math.round(allTimeNetPnl * 100)
	return (
		<div className="gap-s-300 sm:gap-m-400 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 [&>*]:min-w-0">
			<PnlCard grossPnl={stats?.grossPnl ?? null} equityCurve={equityCurve} />
			<CapitalCard
				initialCapitalCents={initialCapitalCents}
				currentCapitalCents={currentCapitalCents}
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

const KpiCards = memo(KpiCardsImpl)

export { KpiCards }
