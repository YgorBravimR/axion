export interface ComplianceTrendPoint {
	weekStart: string // ISO date (YYYY-MM-DD)
	tradeCount: number
	trackedCount: number
	followedCount: number
	compliance: number // 0-100
}
