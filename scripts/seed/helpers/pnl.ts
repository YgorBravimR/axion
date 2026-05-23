// Asset P&L multipliers (per point per contract).
// WIN: R$0.20/pt × 5 pts/tick = R$1.00/tick = 100 cents.
// WDO: R$10.00/pt × 0.5 pts/tick = R$5.00/tick = 500 cents.
export const WIN_PER_POINT = 0.2
export const WDO_PER_POINT = 10.0

export const pointsPerContract = (asset: "WIN" | "WDO"): number =>
	asset === "WIN" ? WIN_PER_POINT : WDO_PER_POINT

export const calculatePnl = (
	asset: "WIN" | "WDO",
	direction: "long" | "short",
	entryPrice: number,
	exitPrice: number,
	size: number
): number => {
	const ppc = pointsPerContract(asset)
	const priceDiff =
		direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice
	return Math.round(priceDiff * size * ppc * 100) / 100
}
