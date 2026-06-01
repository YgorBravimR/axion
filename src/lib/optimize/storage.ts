import type { OptimizationRun } from "@/types/backtest"
import { STORAGE_SCHEMA_VERSION } from "./provenance"
import { paretoRetain } from "./pareto-retain"

const STORAGE_KEY = "axion:optimize:runs"
const STORAGE_VERSION_KEY = "axion:optimize:schemaVersion"
const MAX_RUNS_WARNING = 50

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
				// aggressionMode: "original" | "reversed" → aggression shape
				if (
					gatesRecord.aggressionMode &&
					gatesRecord.aggressionMode !== "off"
				) {
					migrated.aggression = {
						scoreMode: gatesRecord.aggressionMode,
						blockMode: "off" as const,
						threshold: gatesRecord.aggressionThreshold,
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
		// Migrations are idempotent — running them on already-current data is
		// a no-op — so we can apply unconditionally and persist the bumped
		// version on the next save. This keeps the version check simple
		// (single `<`) regardless of how many cumulative bumps land.
		if (storedVersion < STORAGE_SCHEMA_VERSION) {
			return runs.map(migrateRun)
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
		// Apply Pareto retention policy to manage localStorage quota: keep full
		// trades only for Pareto-front runs and single-metric extremes. This ensures
		// we can store complete optimization histories without hitting quota limits.
		const retained = paretoRetain(runs)
		localStorage.setItem(STORAGE_KEY, JSON.stringify(retained))
		localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_SCHEMA_VERSION))
	} catch (error) {
		// Log quota failures instead of silent swallow. Callers can inspect
		// console.warn to diagnose storage issues.
		console.warn("Failed to persist optimization runs to localStorage", error)
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
	migrateRun,
	MAX_RUNS_WARNING,
	STORAGE_SCHEMA_VERSION,
}
