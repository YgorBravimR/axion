export interface DiffConditionEntry {
	conditionId: string
	conditionName: string
	category: string
	tierA: string | null
	tierB: string | null
}

export interface StrategyVersionDiffData {
	versionA: { id: string; version: number; label: string | null }
	versionB: { id: string; version: number; label: string | null }
	conditions: DiffConditionEntry[]
}
