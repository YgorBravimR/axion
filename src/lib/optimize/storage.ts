import type { OptimizationRun } from "@/types/backtest"
import { STORAGE_SCHEMA_VERSION } from "./provenance"

const STORAGE_KEY = "axion:optimize:runs"
const STORAGE_VERSION_KEY = "axion:optimize:schemaVersion"
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
		const runs = JSON.parse(raw) as OptimizationRun[]
		const storedVersion = Number(
			localStorage.getItem(STORAGE_VERSION_KEY) ?? "1"
		)
		if (storedVersion < STORAGE_SCHEMA_VERSION) {
			return runs.map((r) => ({
				...r,
				provenance: r.provenance ?? undefined,
			}))
		}
		return runs
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
		localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_SCHEMA_VERSION))
	} catch {
		// quota — runs still live in memory
	}
}

const clearRuns = (): void => {
	if (typeof window === "undefined") {
		return
	}
	localStorage.removeItem(STORAGE_KEY)
	localStorage.removeItem(STORAGE_VERSION_KEY)
}

const isNearCapacity = (runs: OptimizationRun[]): boolean =>
	runs.length >= MAX_RUNS_WARNING

const isLegacyRun = (run: OptimizationRun): boolean =>
	run.provenance === undefined

export {
	loadRuns,
	saveRuns,
	clearRuns,
	isNearCapacity,
	isLegacyRun,
	MAX_RUNS_WARNING,
	STORAGE_SCHEMA_VERSION,
}
