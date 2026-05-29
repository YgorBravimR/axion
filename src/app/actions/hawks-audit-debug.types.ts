import type { BacktestTrade } from "@/types/backtest"

export type ResultCode = "GA" | "BE" | "ST" | "EOD" | "???"

export interface AuditRow {
	readonly date: string
	readonly label: string
	readonly brickIndex: number
	readonly direction: "long" | "short"
	readonly expectedResult: string | null
	readonly closingBrickPrice: number | null
	readonly trade: BacktestTrade | null
	readonly computedResult: ResultCode | null
	readonly matched: boolean
	readonly mismatchPattern: string | null
}

export interface AuditStats {
	readonly totalDays: number
	readonly totalCatalog: number
	readonly fired: number
	readonly notFired: number
	readonly matched: number
	readonly mismatched: number
	readonly anomalies: number
	readonly matchPct: number
	readonly byPattern: Record<string, number>
}

export interface HawksAuditDebugData {
	readonly assetSymbol: string
	readonly fromDate: string
	readonly toDate: string
	readonly rows: AuditRow[]
	readonly stats: AuditStats
	readonly availableDays: string[]
}

export type HawksAuditDebugResult =
	| { readonly status: "success"; readonly data: HawksAuditDebugData }
	| { readonly status: "error"; readonly message: string }
