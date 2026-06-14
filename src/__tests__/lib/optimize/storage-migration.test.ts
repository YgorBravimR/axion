import { describe, it, expect, beforeEach } from "vitest"
import "fake-indexeddb/auto"
import { migrateRun } from "@/lib/optimize/storage"
import type { OptimizationRun } from "@/types/backtest"

/**
 * Minimal-but-realistic fixture. The migration only reads `label` and
 * `provenance`; the rest is filler so the type-checker is happy.
 */
const baseRun = (overrides: Partial<OptimizationRun>): OptimizationRun =>
	({
		id: "r1",
		label: "Sweep #1",
		recipe: { entry: { type: "hawks_playbook", config: {} } } as never,
		summary: { profitFactor: 1 } as never,
		equityCurve: [],
		trades: [],
		dayBreakdown: [],
		pinned: false,
		createdAt: "2026-05-30T00:00:00.000Z",
		tradesRetained: false,
		...overrides,
	}) as OptimizationRun

beforeEach(() => {
	// Reset IndexedDB between tests by clearing the fake store.
	// This ensures each test starts with a clean slate.
	if (typeof indexedDB !== "undefined") {
		indexedDB.deleteDatabase("axion:optimize")
	}
})

describe("migrateRun (v3 → v4)", () => {
	it("tags an untagged broad sweep as stage='broad'", () => {
		const legacy = baseRun({
			label: "Sweep #1",
			provenance: {
				sweepId: "s",
				datasetHash: "d",
				candleCount: 0,
				dateRangeHash: "r",
				dateFrom: "2026-01-01",
				dateTo: "2026-02-01",
				engineVersion: "test",
				recipeHash: "h",
				schemaVersion: 3,
			} as never,
		})
		const migrated = migrateRun(legacy)
		expect(migrated.provenance?.stage).toBe("broad")
	})

	it("renames `Sweep #N` → `Broad #N`", () => {
		const legacy = baseRun({ label: "Sweep #7" })
		expect(migrateRun(legacy).label).toBe("Broad #7")
	})

	it("leaves refine runs untouched", () => {
		const refine = baseRun({
			label: "Refine #1",
			provenance: {
				sweepId: "s",
				datasetHash: "d",
				candleCount: 0,
				dateRangeHash: "r",
				dateFrom: "2026-01-01",
				dateTo: "2026-02-01",
				engineVersion: "test",
				recipeHash: "h",
				schemaVersion: 4,
				stage: "refine",
				parentRunIds: ["a", "b"],
				journeyId: "j-xyz",
			} as never,
		})
		const migrated = migrateRun(refine)
		expect(migrated.label).toBe("Refine #1")
		expect(migrated.provenance?.stage).toBe("refine")
		expect(migrated.provenance?.parentRunIds).toEqual(["a", "b"])
	})

	it("is idempotent on already-migrated broad runs", () => {
		const current = baseRun({
			label: "Broad #3",
			provenance: {
				sweepId: "s",
				datasetHash: "d",
				candleCount: 0,
				dateRangeHash: "r",
				dateFrom: "2026-01-01",
				dateTo: "2026-02-01",
				engineVersion: "test",
				recipeHash: "h",
				schemaVersion: 4,
				stage: "broad",
			} as never,
		})
		const once = migrateRun(current)
		const twice = migrateRun(once)
		expect(twice).toEqual(once)
		expect(twice.label).toBe("Broad #3")
		expect(twice.provenance?.stage).toBe("broad")
	})

	it("does NOT add stage to runs missing provenance entirely", () => {
		// Pre-v3 runs may lack the `provenance` key altogether. The migration
		// preserves that shape rather than fabricating provenance from nothing.
		const ancient = baseRun({ label: "Sweep #2", provenance: undefined })
		const migrated = migrateRun(ancient)
		expect(migrated.provenance).toBeUndefined()
		// Label is still rewritten — that's safe.
		expect(migrated.label).toBe("Broad #2")
	})
})

describe("migrateRun (v4 → v5 tradesRetained inference)", () => {
	it("sets tradesRetained=true when trades array has entries", () => {
		const legacy = baseRun({
			label: "Broad #1",
			trades: [{ id: "t1" } as never, { id: "t2" } as never],
			tradesRetained: undefined as never,
		})
		const migrated = migrateRun(legacy)
		expect(migrated.tradesRetained).toBe(true)
	})

	it("sets tradesRetained=false when trades array is empty (pre-fix data loss)", () => {
		const legacy = baseRun({
			label: "Broad #2",
			trades: [],
			tradesRetained: undefined as never,
		})
		const migrated = migrateRun(legacy)
		expect(migrated.tradesRetained).toBe(false)
	})

	it("preserves an already-set tradesRetained value (idempotent)", () => {
		const v5Run = baseRun({
			label: "Broad #3",
			trades: [],
			tradesRetained: true,
		})
		const migrated = migrateRun(v5Run)
		expect(migrated.tradesRetained).toBe(true)
	})
})

describe("migrateRun (v5 → v6)", () => {
	it("translates keltnerInnerPenalty: true → keltnerInner: { mode: 'score' }", () => {
		const v5Run = baseRun({
			recipe: {
				presetId: "hawks_v0" as const,
				displayName: "Hawks v0",
				entry: {
					type: "hawks_playbook" as const,
					config: {
						ema27_60m_key: "mme27_60m",
						ema55_60m_key: "mme55_60m",
						ema27_15m_key: "mme27_15m",
						ema55_15m_key: "mme55_15m",
						macd_key: "macd",

						prev_15m_open_key: "prev_15m_open",
						prev_15m_close_key: "prev_15m_close",
						prev_60m_open_key: "prev_60m_open",
						prev_60m_close_key: "prev_60m_close",
						brickSize5mPoints: 100,
						startTime: 930,
						endTime: 1730,
						qualityGates: {
							keltnerInnerPenalty: true,
						},
					},
				},
				stop: { initial: { type: "fixed_points" as const, points: 100 } },
				target: { type: "fixed_levels" as const, levels: [], eodTime: 1730 },
				sizing: { type: "fixed_lots" as const, lots: 1 },
				reversal: { type: "none" as const },
				slippageTicks: 1,
				requiredIndicators: [],
			},
		})
		const migrated = migrateRun(v5Run)
		const gatesConfig =
			migrated.recipe.entry.type === "hawks_playbook"
				? migrated.recipe.entry.config.qualityGates
				: undefined
		expect(gatesConfig).toBeDefined()
		expect(gatesConfig?.keltnerInner).toEqual({ mode: "score" })
		// Legacy field should still exist
		expect(gatesConfig?.keltnerInnerPenalty).toBe(true)
	})

	it("translates macdAlignmentScore: true + macdSlopeWindow: 5 → macd nested", () => {
		const v5Run = baseRun({
			recipe: {
				presetId: "hawks_v0" as const,
				displayName: "Hawks v0",
				entry: {
					type: "hawks_playbook" as const,
					config: {
						ema27_60m_key: "mme27_60m",
						ema55_60m_key: "mme55_60m",
						ema27_15m_key: "mme27_15m",
						ema55_15m_key: "mme55_15m",
						macd_key: "macd",

						prev_15m_open_key: "prev_15m_open",
						prev_15m_close_key: "prev_15m_close",
						prev_60m_open_key: "prev_60m_open",
						prev_60m_close_key: "prev_60m_close",
						brickSize5mPoints: 100,
						startTime: 930,
						endTime: 1730,
						qualityGates: {
							macdAlignmentScore: true,
							macdSlopeWindow: 5,
						},
					},
				},
				stop: { initial: { type: "fixed_points" as const, points: 100 } },
				target: { type: "fixed_levels" as const, levels: [], eodTime: 1730 },
				sizing: { type: "fixed_lots" as const, lots: 1 },
				reversal: { type: "none" as const },
				slippageTicks: 1,
				requiredIndicators: [],
			},
		})
		const migrated = migrateRun(v5Run)
		const gatesConfig =
			migrated.recipe.entry.type === "hawks_playbook"
				? migrated.recipe.entry.config.qualityGates
				: undefined
		expect(gatesConfig?.macd).toEqual({
			mode: "score",
			slopeWindow: 5,
		})
		expect(gatesConfig?.macdAlignmentScore).toBe(true)
	})

	it("translates aggressionMode: 'reversed' + aggressionThreshold: 20000 → aggression nested", () => {
		const v5Run = baseRun({
			recipe: {
				presetId: "hawks_v0" as const,
				displayName: "Hawks v0",
				entry: {
					type: "hawks_playbook" as const,
					config: {
						ema27_60m_key: "mme27_60m",
						ema55_60m_key: "mme55_60m",
						ema27_15m_key: "mme27_15m",
						ema55_15m_key: "mme55_15m",
						macd_key: "macd",

						prev_15m_open_key: "prev_15m_open",
						prev_15m_close_key: "prev_15m_close",
						prev_60m_open_key: "prev_60m_open",
						prev_60m_close_key: "prev_60m_close",
						brickSize5mPoints: 100,
						startTime: 930,
						endTime: 1730,
						qualityGates: {
							aggressionMode: "reversed",
							aggressionThreshold: 20000,
						},
					},
				},
				stop: { initial: { type: "fixed_points" as const, points: 100 } },
				target: { type: "fixed_levels" as const, levels: [], eodTime: 1730 },
				sizing: { type: "fixed_lots" as const, lots: 1 },
				reversal: { type: "none" as const },
				slippageTicks: 1,
				requiredIndicators: [],
			},
		})
		const migrated = migrateRun(v5Run)
		const gatesConfig =
			migrated.recipe.entry.type === "hawks_playbook"
				? migrated.recipe.entry.config.qualityGates
				: undefined
		expect(gatesConfig?.aggression).toEqual({
			scoreMode: "reversed",
			blockMode: "off",
			threshold: 20000,
		})
		expect(gatesConfig?.aggressionMode).toBe("reversed")
	})

	it("is idempotent when new fields already exist", () => {
		const v6Run = baseRun({
			recipe: {
				presetId: "hawks_v0" as const,
				displayName: "Hawks v0",
				entry: {
					type: "hawks_playbook" as const,
					config: {
						ema27_60m_key: "mme27_60m",
						ema55_60m_key: "mme55_60m",
						ema27_15m_key: "mme27_15m",
						ema55_15m_key: "mme55_15m",
						macd_key: "macd",

						prev_15m_open_key: "prev_15m_open",
						prev_15m_close_key: "prev_15m_close",
						prev_60m_open_key: "prev_60m_open",
						prev_60m_close_key: "prev_60m_close",
						brickSize5mPoints: 100,
						startTime: 930,
						endTime: 1730,
						qualityGates: {
							keltnerInner: { mode: "block" },
							keltnerInnerPenalty: true,
						},
					},
				},
				stop: { initial: { type: "fixed_points" as const, points: 100 } },
				target: { type: "fixed_levels" as const, levels: [], eodTime: 1730 },
				sizing: { type: "fixed_lots" as const, lots: 1 },
				reversal: { type: "none" as const },
				slippageTicks: 1,
				requiredIndicators: [],
			},
		})
		const migrated = migrateRun(v6Run)
		const gatesConfig =
			migrated.recipe.entry.type === "hawks_playbook"
				? migrated.recipe.entry.config.qualityGates
				: undefined
		// New field should be untouched (idempotent)
		expect(gatesConfig?.keltnerInner).toEqual({ mode: "block" })
		// Legacy field preserved
		expect(gatesConfig?.keltnerInnerPenalty).toBe(true)
	})

	it("does not error when run has no qualityGates", () => {
		const noGates = baseRun({
			recipe: {
				presetId: "hawks_v0" as const,
				displayName: "Hawks v0",
				entry: {
					type: "hawks_playbook" as const,
					config: {
						ema27_60m_key: "mme27_60m",
						ema55_60m_key: "mme55_60m",
						ema27_15m_key: "mme27_15m",
						ema55_15m_key: "mme55_15m",
						macd_key: "macd",

						prev_15m_open_key: "prev_15m_open",
						prev_15m_close_key: "prev_15m_close",
						prev_60m_open_key: "prev_60m_open",
						prev_60m_close_key: "prev_60m_close",
						brickSize5mPoints: 100,
						startTime: 930,
						endTime: 1730,
					},
				},
				stop: { initial: { type: "fixed_points" as const, points: 100 } },
				target: { type: "fixed_levels" as const, levels: [], eodTime: 1730 },
				sizing: { type: "fixed_lots" as const, lots: 1 },
				reversal: { type: "none" as const },
				slippageTicks: 1,
				requiredIndicators: [],
			},
		})
		const migrated = migrateRun(noGates)
		const gatesConfig =
			migrated.recipe.entry.type === "hawks_playbook"
				? migrated.recipe.entry.config.qualityGates
				: undefined
		expect(gatesConfig).toBeUndefined()
	})
})
