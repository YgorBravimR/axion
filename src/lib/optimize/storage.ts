import type { OptimizationRun } from "@/types/backtest"
import { STORAGE_SCHEMA_VERSION } from "./provenance"
import { paretoRetain } from "./pareto-retain"
import { openDB, type IDBPDatabase } from "idb"

const DB_NAME = "axion:optimize"
const DB_VERSION = 1
const STORE_NAME = "runs"
const LEGACY_STORAGE_KEY = "axion:optimize:runs"
const LEGACY_STORAGE_VERSION_KEY = "axion:optimize:schemaVersion"
const MAX_RUNS_WARNING = 50

let dbInstance: IDBPDatabase<OptimizeDB> | null = null

interface OptimizeDB {
	runs: {
		key: string
		value: OptimizationRun
	}
}

const getDB = async (): Promise<IDBPDatabase<OptimizeDB>> => {
	if (dbInstance) {
		return dbInstance
	}

	dbInstance = await openDB<OptimizeDB>(DB_NAME, DB_VERSION, {
		upgrade: (db) => {
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: "id" })
			}
		},
	})

	return dbInstance
}

/**
 * Migrate a single run forward to the current schema. Idempotent — runs
 * already on the latest schema pass through untouched. Each version bump
 * adds one conditional rewrite here so loading legacy data is safe.
 */
const migrateRun = (run: OptimizationRun): OptimizationRun => {
	// v3 normalization: ensure provenance key exists (may be missing on v2).
	const withProvenance: OptimizationRun = {
		...run,
		provenance: run.provenance ?? undefined,
	}

	// v4: retag untagged broad sweeps + rename `Sweep #N` → `Broad #N`.
	// Untagged means the orchestrator didn't pass an explicit funnel stage
	// before the v4 fix — that was always the broad path. Refines were
	// always explicitly tagged, so we don't risk mis-tagging a refine here.
	const needsBroadTag =
		withProvenance.provenance !== undefined &&
		withProvenance.provenance.stage === undefined
	const needsLabelRename = withProvenance.label.startsWith("Sweep #")

	const withV4Migration =
		!needsBroadTag && !needsLabelRename
			? withProvenance
			: {
					...withProvenance,
					label: needsLabelRename
						? withProvenance.label.replace(/^Sweep #/, "Broad #")
						: withProvenance.label,
					provenance:
						needsBroadTag && withProvenance.provenance
							? {
									...withProvenance.provenance,
									stage: "broad" as const,
								}
							: withProvenance.provenance,
				}

	// v5: ensure tradesRetained flag exists. If undefined (legacy v4 run),
	// infer from the actual trades array — true if any trades survived,
	// false if the array is empty (the pre-fix runner hardcoded trades: [],
	// so most legacy v4 runs have no trades to retain).
	const withV5Migration =
		withV4Migration.tradesRetained === undefined
			? {
					...withV4Migration,
					tradesRetained: (withV4Migration.trades?.length ?? 0) > 0,
				}
			: withV4Migration

	// v6: dual-mode quality gates. Translate legacy flat flags to new nested
	// shapes. If new fields already exist, skip (idempotent). Migration reads
	// from recipe.entry.config.qualityGates and preserves both old and new
	// fields — piece B will rewrite the rule code and delete legacy fields later.
	try {
		const recipe = withV5Migration.recipe
		const entry = recipe?.entry
		if (entry && "config" in entry) {
			const entryConfig = entry.config as unknown as Record<string, unknown>
			const gatesConfig = entryConfig.qualityGates
			if (
				gatesConfig &&
				typeof gatesConfig === "object" &&
				!(
					"keltnerInner" in gatesConfig ||
					"macd" in gatesConfig ||
					"volume" in gatesConfig ||
					"aggression" in gatesConfig
				)
			) {
				const gatesRecord = gatesConfig as Record<string, unknown>
				const migrated = { ...gatesRecord }
				// keltnerInnerPenalty: true → { mode: "score" }
				if (gatesRecord.keltnerInnerPenalty === true) {
					migrated.keltnerInner = { mode: "score" }
				}
				// macdAlignmentScore: true → { mode: "score", slopeWindow: <existing> }
				if (gatesRecord.macdAlignmentScore === true) {
					migrated.macd = {
						mode: "score" as const,
						slopeWindow: gatesRecord.macdSlopeWindow,
					}
				}
				// volumeScore: true → { mode: "score", emaPeriod: <existing> }
				if (gatesRecord.volumeScore === true) {
					migrated.volume = {
						mode: "score" as const,
						emaPeriod: gatesRecord.volumeEmaPeriod,
					}
				}
				// aggressionMode: "original" → aggression shape. Legacy "reversed"
				// values from pre-2026-06-16 saved runs are coerced to "off"
				// (the type literal was pruned; see Group F audit).
				if (
					gatesRecord.aggressionMode &&
					gatesRecord.aggressionMode !== "off"
				) {
					const coercedMode =
						gatesRecord.aggressionMode === "original"
							? ("original" as const)
							: ("off" as const)
					migrated.aggression = {
						scoreMode: coercedMode,
						blockMode: "off" as const,
						threshold: gatesRecord.aggressionThreshold,
					}
					// Also coerce the legacy flat field so callers that read either
					// shape see consistent values.
					if (gatesRecord.aggressionMode === "reversed") {
						migrated.aggressionMode = "off"
					}
				}
				entryConfig.qualityGates = migrated
			}
		}
	} catch {
		// If migration fails, leave run untouched. This preserves data integrity
		// and lets the next run attempt retry the migration.
	}

	return withV5Migration
}

const loadRuns = async (): Promise<OptimizationRun[]> => {
	if (typeof window === "undefined") {
		return []
	}

	try {
		const db = await getDB()
		const allKeys = await db.getAllKeys(STORE_NAME)

		// If IDB has data, we're already migrated. Load and return.
		if (allKeys.length > 0) {
			const runs = await Promise.all(
				allKeys.map((key) => db.get(STORE_NAME, key))
			)
			return runs.filter((r): r is OptimizationRun => r !== undefined)
		}

		// IDB is empty. Check if localStorage has legacy data to migrate.
		const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
		if (!raw) {
			return []
		}

		const runs = JSON.parse(raw) as OptimizationRun[]
		const storedVersion = Number(
			localStorage.getItem(LEGACY_STORAGE_VERSION_KEY) ?? "1"
		)

		// Migrations are idempotent — running them on already-current data is
		// a no-op — so we can apply unconditionally. This keeps the version
		// check simple (single `<`) regardless of cumulative bumps.
		const migratedRuns =
			storedVersion < STORAGE_SCHEMA_VERSION ? runs.map(migrateRun) : runs

		// Write migrated runs to IDB and clear localStorage.
		const tx = db.transaction(STORE_NAME, "readwrite")
		const store = tx.objectStore(STORE_NAME)
		const putPromises = migratedRuns.map((run) => store.put(run))
		await Promise.all(putPromises)
		await tx.done

		// Clear legacy keys after successful migration.
		localStorage.removeItem(LEGACY_STORAGE_KEY)
		localStorage.removeItem(LEGACY_STORAGE_VERSION_KEY)

		return migratedRuns
	} catch (error) {
		console.error("Failed to load optimization runs from IndexedDB", error)
		return []
	}
}

const saveRuns = async (runs: OptimizationRun[]): Promise<void> => {
	if (typeof window === "undefined") {
		return
	}

	try {
		// Apply Pareto retention policy to manage storage quota: keep full
		// trades only for Pareto-front runs and single-metric extremes. IndexedDB
		// has gigabytes of headroom, but we retain this policy for consistency.
		const retained = paretoRetain(runs)

		const db = await getDB()
		const tx = db.transaction(STORE_NAME, "readwrite")
		const store = tx.objectStore(STORE_NAME)

		// Clear all existing runs and write retained set.
		await store.clear()
		const putPromises = retained.map((run) => store.put(run))
		await Promise.all(putPromises)
		await tx.done
	} catch (error) {
		console.warn("Failed to persist optimization runs to IndexedDB", error)
	}
}

const clearRuns = async (): Promise<void> => {
	if (typeof window === "undefined") {
		return
	}

	try {
		const db = await getDB()
		await db.clear(STORE_NAME)
	} catch (error) {
		console.warn("Failed to clear optimization runs from IndexedDB", error)
	}
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
	migrateRun,
	MAX_RUNS_WARNING,
	STORAGE_SCHEMA_VERSION,
}
