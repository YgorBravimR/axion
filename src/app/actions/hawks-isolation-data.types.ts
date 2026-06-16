import type { UserEntry } from "@/types/backtest"

interface CatalogEntry extends UserEntry {
	label?: string
	tradeNumber?: number | string
	closePrice?: number
}

interface CatalogMarker {
	brickIndex: number
	label: string
	direction: "short" | "long"
	closePrice: number | null
}

interface IsolationCandle {
	timestamp: string
	open: number
	high: number
	low: number
	close: number
	indicators: Readonly<Record<string, number | null>>
}

interface IsolationGateSnapshot {
	timestamp: string
	gate15m: "BULL" | "BEAR" | "NO_SIGNAL"
	gate60m: "BULL" | "BEAR" | "NO_SIGNAL"
}

interface HawksIsolationData {
	date: string
	candles5m: IsolationCandle[]
	candles15m: IsolationCandle[]
	candles60m: IsolationCandle[]
	walkerByTimestamp: Record<
		string,
		{
			gate15m: "BULL" | "BEAR" | "NO_SIGNAL"
			gate60m: "BULL" | "BEAR" | "NO_SIGNAL"
		}
	>
	catalog: CatalogMarker[]
	cleanDays: string[]
}

export type {
	CatalogEntry,
	CatalogMarker,
	IsolationCandle,
	IsolationGateSnapshot,
	HawksIsolationData,
}
