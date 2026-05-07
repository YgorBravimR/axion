import type { OptimizationRun } from "@/types/backtest"

const STORAGE_KEY = "axion:optimize:runs"
const MAX_RUNS_WARNING = 50

const loadRuns = (): OptimizationRun[] => {
	if (typeof window === "undefined") {
		return []
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) {
			return []
		}
		return JSON.parse(raw) as OptimizationRun[]
	} catch {
		return []
	}
}

const saveRuns = (runs: OptimizationRun[]): void => {
	if (typeof window === "undefined") {
		return
	}
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(runs))
	} catch {
		// localStorage full — silently fail, runs still live in memory
	}
}

const clearRuns = (): void => {
	if (typeof window === "undefined") {
		return
	}
	localStorage.removeItem(STORAGE_KEY)
}

const isNearCapacity = (runs: OptimizationRun[]): boolean =>
	runs.length >= MAX_RUNS_WARNING

export { loadRuns, saveRuns, clearRuns, isNearCapacity, MAX_RUNS_WARNING }
