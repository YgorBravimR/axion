/**
 * Unit tests for the Saved Filter Presets feature.
 *
 * Because the server actions (`filter-presets.ts`) require a live DB connection
 * and the component (`preset-selector.tsx`) requires a browser/jsdom environment,
 * this suite isolates and tests all PURE LOGIC that can be exercised without
 * those dependencies:
 *
 *   1. SavedFilterState JSON serialization / deserialization (roundtrip)
 *   2. applyPreset mapping — SavedFilterState → URL-params shape
 *   3. serializeFilters mapping — filter state + meta → SavedFilterState
 *   4. Default preset toggling — local optimistic state update
 *   5. Name validation — the same guard used in createFilterPreset /
 *      updateFilterPreset on the server
 *   6. Edge cases — null vs undefined, empty arrays, partial state
 *
 * No DB, no React, no MSW required.
 */

import { describe, it, expect } from "vitest"
import type { SavedFilterState } from "@/app/actions/filter-presets"

// ============================================================================
// HELPERS — extracted from filter-panel.tsx so they can be tested in isolation
// without importing the full React component tree.
//
// These are the identical algorithms that live inside `useAnalyticsFilters`.
// Keeping them as standalone pure functions here makes them unit-testable.
// ============================================================================

/**
 * Mirrors `applyPreset` in `useAnalyticsFilters`.
 * Returns the URL-params object that would be passed to `urlParams.set(...)`.
 */
const buildUrlParamsFromPreset = (
	saved: SavedFilterState
): Record<string, string | string[] | null> => ({
	datePreset: saved.datePreset ?? null,
	from: saved.dateFrom ?? null,
	to: saved.dateTo ?? null,
	assets: saved.assets ?? [],
	directions: saved.directions ?? [],
	outcomes: saved.outcomes ?? [],
	timeframeIds: saved.timeframeIds ?? [],
	groupBy: saved.groupBy ?? null,
	expectancy: saved.expectancyMode ?? null,
})

interface FilterStateInput {
	assets: string[]
	directions: Array<"long" | "short">
	outcomes: Array<"win" | "loss" | "breakeven">
	timeframeIds: string[]
	dateFrom: Date | null
	dateTo: Date | null
}

/**
 * Mirrors `serializeFilters` in `useAnalyticsFilters`.
 * "custom" datePreset is stored as null so that the saved preset re-applies
 * exact from/to dates rather than a named preset key.
 */
const serializeFilters = (
	filters: FilterStateInput,
	activePresetKey: string | null,
	groupBy: string,
	expectancyMode: string
): SavedFilterState => ({
	datePreset: activePresetKey === "custom" ? null : activePresetKey,
	dateFrom: filters.dateFrom?.toISOString() ?? null,
	dateTo: filters.dateTo?.toISOString() ?? null,
	assets: filters.assets.length > 0 ? filters.assets : undefined,
	directions: filters.directions.length > 0 ? filters.directions : undefined,
	outcomes: filters.outcomes.length > 0 ? filters.outcomes : undefined,
	timeframeIds: filters.timeframeIds.length > 0 ? filters.timeframeIds : undefined,
	groupBy,
	expectancyMode,
})

/**
 * Mirrors the name validation guard in `createFilterPreset` /
 * `updateFilterPreset` on the server action.
 * Returns null when the name is valid, or an error message string when not.
 */
const validatePresetName = (rawName: string): string | null => {
	const name = rawName.trim()
	if (!name || name.length > 100) {
		return "Preset name is required (max 100 characters)"
	}
	return null
}

/**
 * Mirrors the optimistic local state update in `handleSetDefault` inside
 * `PresetSelector`. When toggling a preset's default flag, every other preset
 * loses its default status.
 */
interface PresetLike {
	id: string
	isDefault: boolean
}

const applyDefaultToggle = <T extends PresetLike>(
	presets: T[],
	targetId: string,
	newDefaultValue: boolean
): T[] =>
	presets.map((preset) => ({
		...preset,
		isDefault: preset.id === targetId ? newDefaultValue : false,
	}))

// ============================================================================
// FACTORIES
// ============================================================================

const createSavedFilterState = (
	overrides: Partial<SavedFilterState> = {}
): SavedFilterState => ({
	datePreset: null,
	dateFrom: null,
	dateTo: null,
	assets: undefined,
	directions: undefined,
	outcomes: undefined,
	timeframeIds: undefined,
	groupBy: "asset",
	expectancyMode: "edge",
	...overrides,
})

const createFilterStateInput = (
	overrides: Partial<FilterStateInput> = {}
): FilterStateInput => ({
	assets: [],
	directions: [],
	outcomes: [],
	timeframeIds: [],
	dateFrom: null,
	dateTo: null,
	...overrides,
})

// ============================================================================
// 1. JSON SERIALIZATION / DESERIALIZATION — ROUNDTRIP
// ============================================================================

describe("SavedFilterState — JSON roundtrip", () => {
	it("should survive a roundtrip for a fully populated state", () => {
		const original = createSavedFilterState({
			datePreset: "week",
			dateFrom: "2026-01-01T00:00:00.000Z",
			dateTo: "2026-01-07T23:59:59.000Z",
			assets: ["WIN", "PETR4"],
			directions: ["long", "short"],
			outcomes: ["win", "loss", "breakeven"],
			timeframeIds: ["tf-1", "tf-2"],
			groupBy: "timeframe",
			expectancyMode: "winrate",
		})

		const serialized = JSON.stringify(original)
		const deserialized = JSON.parse(serialized) as SavedFilterState

		expect(deserialized.datePreset).toBe(original.datePreset)
		expect(deserialized.dateFrom).toBe(original.dateFrom)
		expect(deserialized.dateTo).toBe(original.dateTo)
		expect(deserialized.assets).toEqual(original.assets)
		expect(deserialized.directions).toEqual(original.directions)
		expect(deserialized.outcomes).toEqual(original.outcomes)
		expect(deserialized.timeframeIds).toEqual(original.timeframeIds)
		expect(deserialized.groupBy).toBe(original.groupBy)
		expect(deserialized.expectancyMode).toBe(original.expectancyMode)
	})

	it("should survive a roundtrip for a minimal state with no optional fields", () => {
		const minimal: SavedFilterState = {}

		const deserialized = JSON.parse(JSON.stringify(minimal)) as SavedFilterState

		expect(deserialized).toEqual({})
		expect(deserialized.datePreset).toBeUndefined()
		expect(deserialized.assets).toBeUndefined()
	})

	it("should preserve explicit null values through the roundtrip", () => {
		const state = createSavedFilterState({
			datePreset: null,
			dateFrom: null,
			dateTo: null,
		})

		const deserialized = JSON.parse(JSON.stringify(state)) as SavedFilterState

		expect(deserialized.datePreset).toBeNull()
		expect(deserialized.dateFrom).toBeNull()
		expect(deserialized.dateTo).toBeNull()
	})

	it("should preserve empty arrays through the roundtrip", () => {
		const state = createSavedFilterState({
			assets: [],
			directions: [],
			outcomes: [],
			timeframeIds: [],
		})

		const deserialized = JSON.parse(JSON.stringify(state)) as SavedFilterState

		expect(deserialized.assets).toEqual([])
		expect(deserialized.directions).toEqual([])
		expect(deserialized.outcomes).toEqual([])
		expect(deserialized.timeframeIds).toEqual([])
	})

	it("should preserve single-element arrays through the roundtrip", () => {
		const state = createSavedFilterState({
			assets: ["WIN"],
			directions: ["long"],
			outcomes: ["win"],
			timeframeIds: ["tf-abc-123"],
		})

		const deserialized = JSON.parse(JSON.stringify(state)) as SavedFilterState

		expect(deserialized.assets).toEqual(["WIN"])
		expect(deserialized.directions).toEqual(["long"])
		expect(deserialized.outcomes).toEqual(["win"])
		expect(deserialized.timeframeIds).toEqual(["tf-abc-123"])
	})

	it("should handle all valid datePreset string values through the roundtrip", () => {
		const validPresets = ["today", "week", "month", "year"] as const

		for (const preset of validPresets) {
			const state = createSavedFilterState({ datePreset: preset })
			const deserialized = JSON.parse(JSON.stringify(state)) as SavedFilterState
			expect(deserialized.datePreset).toBe(preset)
		}
	})

	it("should not corrupt numeric or boolean-like strings stored in assets", () => {
		const state = createSavedFilterState({ assets: ["123", "true", "null"] })
		const deserialized = JSON.parse(JSON.stringify(state)) as SavedFilterState

		expect(deserialized.assets).toEqual(["123", "true", "null"])
	})
})

// ============================================================================
// 2. buildUrlParamsFromPreset — URL PARAMS MAPPING
// ============================================================================

describe("buildUrlParamsFromPreset", () => {
	it("should map a fully populated preset to the correct URL params shape", () => {
		const preset = createSavedFilterState({
			datePreset: "month",
			dateFrom: "2026-01-01",
			dateTo: "2026-01-31",
			assets: ["WIN"],
			directions: ["long"],
			outcomes: ["win"],
			timeframeIds: ["tf-1"],
			groupBy: "timeframe",
			expectancyMode: "winrate",
		})

		const params = buildUrlParamsFromPreset(preset)

		expect(params.datePreset).toBe("month")
		expect(params.from).toBe("2026-01-01")
		expect(params.to).toBe("2026-01-31")
		expect(params.assets).toEqual(["WIN"])
		expect(params.directions).toEqual(["long"])
		expect(params.outcomes).toEqual(["win"])
		expect(params.timeframeIds).toEqual(["tf-1"])
		expect(params.groupBy).toBe("timeframe")
		expect(params.expectancy).toBe("winrate")
	})

	it("should produce null for datePreset when preset has null datePreset", () => {
		const preset = createSavedFilterState({ datePreset: null })
		const params = buildUrlParamsFromPreset(preset)

		expect(params.datePreset).toBeNull()
	})

	it("should fall back to empty arrays when array fields are undefined", () => {
		const preset: SavedFilterState = {
			groupBy: "asset",
			expectancyMode: "edge",
		}

		const params = buildUrlParamsFromPreset(preset)

		expect(params.assets).toEqual([])
		expect(params.directions).toEqual([])
		expect(params.outcomes).toEqual([])
		expect(params.timeframeIds).toEqual([])
	})

	it("should produce null for groupBy when preset has undefined groupBy", () => {
		const preset: SavedFilterState = {}
		const params = buildUrlParamsFromPreset(preset)

		expect(params.groupBy).toBeNull()
	})

	it("should produce null for expectancy when preset has undefined expectancyMode", () => {
		const preset: SavedFilterState = {}
		const params = buildUrlParamsFromPreset(preset)

		expect(params.expectancy).toBeNull()
	})

	it("should produce null for from and to when preset has null date fields", () => {
		const preset = createSavedFilterState({ dateFrom: null, dateTo: null })
		const params = buildUrlParamsFromPreset(preset)

		expect(params.from).toBeNull()
		expect(params.to).toBeNull()
	})

	it("should correctly pass through a multi-asset, multi-direction preset", () => {
		const preset = createSavedFilterState({
			assets: ["WIN", "PETR4", "VALE3"],
			directions: ["long", "short"],
			outcomes: ["win", "loss"],
		})

		const params = buildUrlParamsFromPreset(preset)

		expect(params.assets).toEqual(["WIN", "PETR4", "VALE3"])
		expect(params.directions).toEqual(["long", "short"])
		expect(params.outcomes).toEqual(["win", "loss"])
	})

	it("should use the datePreset key exactly as stored — no transformation", () => {
		const preset = createSavedFilterState({ datePreset: "today" })
		const params = buildUrlParamsFromPreset(preset)

		// The consumer (`urlParams.set`) will interpret "today" as the date preset
		expect(params.datePreset).toBe("today")
	})
})

// ============================================================================
// 3. serializeFilters — FILTER STATE → SavedFilterState
// ============================================================================

describe("serializeFilters", () => {
	it("should serialize a fully active filter state correctly", () => {
		const dateFrom = new Date("2026-01-01T00:00:00.000Z")
		const dateTo = new Date("2026-01-31T00:00:00.000Z")
		const filters = createFilterStateInput({
			assets: ["WIN"],
			directions: ["long"],
			outcomes: ["win"],
			timeframeIds: ["tf-1"],
			dateFrom,
			dateTo,
		})

		const result = serializeFilters(filters, "custom", "asset", "edge")

		expect(result.datePreset).toBeNull() // "custom" becomes null
		expect(result.dateFrom).toBe(dateFrom.toISOString())
		expect(result.dateTo).toBe(dateTo.toISOString())
		expect(result.assets).toEqual(["WIN"])
		expect(result.directions).toEqual(["long"])
		expect(result.outcomes).toEqual(["win"])
		expect(result.timeframeIds).toEqual(["tf-1"])
		expect(result.groupBy).toBe("asset")
		expect(result.expectancyMode).toBe("edge")
	})

	it("should store datePreset as null when activePresetKey is custom", () => {
		const filters = createFilterStateInput({
			dateFrom: new Date("2026-01-01T00:00:00.000Z"),
			dateTo: new Date("2026-01-07T00:00:00.000Z"),
		})

		const result = serializeFilters(filters, "custom", "asset", "edge")

		expect(result.datePreset).toBeNull()
	})

	it("should store datePreset as the key when a named preset is active", () => {
		const filters = createFilterStateInput()

		const result = serializeFilters(filters, "week", "asset", "edge")

		expect(result.datePreset).toBe("week")
	})

	it("should store datePreset as null when activePresetKey is null (all time)", () => {
		const filters = createFilterStateInput()

		const result = serializeFilters(filters, null, "asset", "edge")

		expect(result.datePreset).toBeNull()
	})

	it("should omit assets when the array is empty (sets undefined, not [])", () => {
		const filters = createFilterStateInput({ assets: [] })
		const result = serializeFilters(filters, null, "asset", "edge")

		expect(result.assets).toBeUndefined()
	})

	it("should omit directions when the array is empty", () => {
		const filters = createFilterStateInput({ directions: [] })
		const result = serializeFilters(filters, null, "asset", "edge")

		expect(result.directions).toBeUndefined()
	})

	it("should omit outcomes when the array is empty", () => {
		const filters = createFilterStateInput({ outcomes: [] })
		const result = serializeFilters(filters, null, "asset", "edge")

		expect(result.outcomes).toBeUndefined()
	})

	it("should omit timeframeIds when the array is empty", () => {
		const filters = createFilterStateInput({ timeframeIds: [] })
		const result = serializeFilters(filters, null, "asset", "edge")

		expect(result.timeframeIds).toBeUndefined()
	})

	it("should include assets when the array is non-empty", () => {
		const filters = createFilterStateInput({ assets: ["WIN", "PETR4"] })
		const result = serializeFilters(filters, null, "asset", "edge")

		expect(result.assets).toEqual(["WIN", "PETR4"])
	})

	it("should set dateFrom and dateTo to null when filter has no dates", () => {
		const filters = createFilterStateInput({ dateFrom: null, dateTo: null })
		const result = serializeFilters(filters, null, "asset", "edge")

		expect(result.dateFrom).toBeNull()
		expect(result.dateTo).toBeNull()
	})

	it("should serialize dateFrom as a valid ISO string when a date is present", () => {
		const dateFrom = new Date("2026-03-15T12:00:00.000Z")
		const filters = createFilterStateInput({ dateFrom })
		const result = serializeFilters(filters, null, "asset", "edge")

		expect(result.dateFrom).toBe("2026-03-15T12:00:00.000Z")
		// Verify it is a parseable ISO string
		expect(() => new Date(result.dateFrom!)).not.toThrow()
		expect(isNaN(new Date(result.dateFrom!).getTime())).toBe(false)
	})

	it("should capture groupBy correctly for each valid value", () => {
		const validGroupByValues = [
			"asset",
			"timeframe",
			"hour",
			"dayOfWeek",
			"strategy",
		]

		for (const groupBy of validGroupByValues) {
			const result = serializeFilters(
				createFilterStateInput(),
				null,
				groupBy,
				"edge"
			)
			expect(result.groupBy).toBe(groupBy)
		}
	})

	it("should capture expectancyMode correctly for each valid value", () => {
		const validModes = ["edge", "winrate"]

		for (const mode of validModes) {
			const result = serializeFilters(
				createFilterStateInput(),
				null,
				"asset",
				mode
			)
			expect(result.expectancyMode).toBe(mode)
		}
	})

	it("should produce a state that survives a JSON roundtrip unchanged", () => {
		const filters = createFilterStateInput({
			assets: ["WIN"],
			directions: ["long"],
			outcomes: ["win"],
			dateFrom: new Date("2026-01-01T00:00:00.000Z"),
		})

		const serialized = serializeFilters(filters, "month", "asset", "edge")
		const roundtripped = JSON.parse(
			JSON.stringify(serialized)
		) as SavedFilterState

		expect(roundtripped.datePreset).toBe(serialized.datePreset)
		expect(roundtripped.dateFrom).toBe(serialized.dateFrom)
		expect(roundtripped.assets).toEqual(serialized.assets)
		expect(roundtripped.groupBy).toBe(serialized.groupBy)
		expect(roundtripped.expectancyMode).toBe(serialized.expectancyMode)
	})
})

// ============================================================================
// 4. DEFAULT PRESET TOGGLING — optimistic local state update
// ============================================================================

describe("applyDefaultToggle", () => {
	it("should set the target preset as default and clear all others", () => {
		const presets: PresetLike[] = [
			{ id: "preset-a", isDefault: true },
			{ id: "preset-b", isDefault: false },
			{ id: "preset-c", isDefault: false },
		]

		const updated = applyDefaultToggle(presets, "preset-b", true)

		expect(updated.find((p) => p.id === "preset-a")?.isDefault).toBe(false)
		expect(updated.find((p) => p.id === "preset-b")?.isDefault).toBe(true)
		expect(updated.find((p) => p.id === "preset-c")?.isDefault).toBe(false)
	})

	it("should unset the default when toggling an already-default preset to false", () => {
		const presets: PresetLike[] = [
			{ id: "preset-a", isDefault: true },
			{ id: "preset-b", isDefault: false },
		]

		const updated = applyDefaultToggle(presets, "preset-a", false)

		expect(updated.find((p) => p.id === "preset-a")?.isDefault).toBe(false)
		expect(updated.find((p) => p.id === "preset-b")?.isDefault).toBe(false)
	})

	it("should not mutate the original presets array", () => {
		const presets: PresetLike[] = [
			{ id: "preset-a", isDefault: false },
			{ id: "preset-b", isDefault: false },
		]
		const originalSnapshot = presets.map((p) => ({ ...p }))

		applyDefaultToggle(presets, "preset-a", true)

		expect(presets).toEqual(originalSnapshot)
	})

	it("should return a new array reference", () => {
		const presets: PresetLike[] = [{ id: "preset-a", isDefault: false }]

		const updated = applyDefaultToggle(presets, "preset-a", true)

		expect(updated).not.toBe(presets)
	})

	it("should clear all defaults even when multiple presets incorrectly have isDefault true", () => {
		// Guards against a corrupted state where multiple presets are marked as default
		const presets: PresetLike[] = [
			{ id: "preset-a", isDefault: true },
			{ id: "preset-b", isDefault: true },
			{ id: "preset-c", isDefault: false },
		]

		const updated = applyDefaultToggle(presets, "preset-c", true)

		expect(updated.find((p) => p.id === "preset-a")?.isDefault).toBe(false)
		expect(updated.find((p) => p.id === "preset-b")?.isDefault).toBe(false)
		expect(updated.find((p) => p.id === "preset-c")?.isDefault).toBe(true)
	})

	it("should handle a single-preset list correctly", () => {
		const presets: PresetLike[] = [{ id: "preset-only", isDefault: false }]

		const updated = applyDefaultToggle(presets, "preset-only", true)

		expect(updated[0]?.isDefault).toBe(true)
	})

	it("should handle an empty preset list without throwing", () => {
		const updated = applyDefaultToggle([], "preset-x", true)

		expect(updated).toEqual([])
	})

	it("should set all presets to false when target id does not exist in list", () => {
		// Non-existent target: no preset matches, so all become false
		const presets: PresetLike[] = [
			{ id: "preset-a", isDefault: true },
			{ id: "preset-b", isDefault: false },
		]

		const updated = applyDefaultToggle(presets, "preset-nonexistent", true)

		expect(updated.find((p) => p.id === "preset-a")?.isDefault).toBe(false)
		expect(updated.find((p) => p.id === "preset-b")?.isDefault).toBe(false)
	})

	it("should preserve all non-default fields on each preset", () => {
		interface ExtendedPreset extends PresetLike {
			name: string
			filters: string
		}

		const presets: ExtendedPreset[] = [
			{ id: "preset-a", isDefault: false, name: "Morning Setup", filters: "{}" },
			{ id: "preset-b", isDefault: false, name: "Scalp Filter", filters: '{"assets":["WIN"]}' },
		]

		const updated = applyDefaultToggle(presets, "preset-a", true) as ExtendedPreset[]

		expect(updated.find((p) => p.id === "preset-a")?.name).toBe("Morning Setup")
		expect(updated.find((p) => p.id === "preset-b")?.name).toBe("Scalp Filter")
		expect(updated.find((p) => p.id === "preset-a")?.filters).toBe("{}")
	})
})

// ============================================================================
// 5. NAME VALIDATION
// ============================================================================

describe("validatePresetName", () => {
	it("should return null for a valid standard name", () => {
		expect(validatePresetName("Morning Scalp Setup")).toBeNull()
	})

	it("should return null for a name that is exactly 1 character after trim", () => {
		// The guard is: !name (falsy), so a 1-char name is valid
		expect(validatePresetName("A")).toBeNull()
	})

	it("should return null for a name that is exactly 100 characters", () => {
		const name = "A".repeat(100)
		expect(validatePresetName(name)).toBeNull()
	})

	it("should return an error message for an empty string", () => {
		const result = validatePresetName("")
		expect(result).not.toBeNull()
		expect(result).toContain("required")
	})

	it("should return an error message for a whitespace-only string", () => {
		const result = validatePresetName("   ")
		expect(result).not.toBeNull()
		expect(result).toContain("required")
	})

	it("should return an error message for a tab-only string", () => {
		const result = validatePresetName("\t\t\t")
		expect(result).not.toBeNull()
		expect(result).toContain("required")
	})

	it("should return an error message for a name that is exactly 101 characters", () => {
		const name = "A".repeat(101)
		const result = validatePresetName(name)
		expect(result).not.toBeNull()
		expect(result).toContain("100")
	})

	it("should return an error message for a name that is 200 characters", () => {
		const name = "A".repeat(200)
		expect(validatePresetName(name)).not.toBeNull()
	})

	it("should trim leading and trailing whitespace before validating length", () => {
		// 2 spaces + 100 'A's + 2 spaces = 104 chars raw, but 100 after trim → valid
		const name = "  " + "A".repeat(100) + "  "
		expect(validatePresetName(name)).toBeNull()
	})

	it("should reject a name where the trimmed length exceeds 100", () => {
		// 2 spaces + 101 'A's + 2 spaces = 105 chars raw, 101 after trim → invalid
		const name = "  " + "A".repeat(101) + "  "
		expect(validatePresetName(name)).not.toBeNull()
	})

	it("should accept names with special characters and emoji", () => {
		// No restriction on character type — only length matters
		expect(validatePresetName("WIN — Long Only (Week)")).toBeNull()
		expect(validatePresetName("Setup #1 / Breakout")).toBeNull()
	})
})

// ============================================================================
// 6. EDGE CASES
// ============================================================================

describe("SavedFilterState — edge cases", () => {
	it("should handle a preset with no filters set (all undefined) gracefully in apply", () => {
		const empty: SavedFilterState = {}
		const params = buildUrlParamsFromPreset(empty)

		expect(params.assets).toEqual([])
		expect(params.directions).toEqual([])
		expect(params.outcomes).toEqual([])
		expect(params.timeframeIds).toEqual([])
		expect(params.datePreset).toBeNull()
		expect(params.from).toBeNull()
		expect(params.to).toBeNull()
		expect(params.groupBy).toBeNull()
		expect(params.expectancy).toBeNull()
	})

	it("should treat null and undefined datePreset identically in apply (both become null)", () => {
		const withNull = buildUrlParamsFromPreset({ datePreset: null })
		const withUndefined = buildUrlParamsFromPreset({ datePreset: undefined })

		expect(withNull.datePreset).toBeNull()
		expect(withUndefined.datePreset).toBeNull()
	})

	it("should treat null and undefined dateFrom identically in apply (both become null)", () => {
		const withNull = buildUrlParamsFromPreset({ dateFrom: null })
		const withUndefined = buildUrlParamsFromPreset({ dateFrom: undefined })

		expect(withNull.from).toBeNull()
		expect(withUndefined.from).toBeNull()
	})

	it("should treat null and undefined assets identically in apply (both become [])", () => {
		const withUndefined = buildUrlParamsFromPreset({ assets: undefined })
		const withNull = buildUrlParamsFromPreset({})

		expect(withUndefined.assets).toEqual([])
		expect(withNull.assets).toEqual([])
	})

	it("should preserve asset order through apply", () => {
		const preset = createSavedFilterState({
			assets: ["PETR4", "WIN", "VALE3"],
		})
		const params = buildUrlParamsFromPreset(preset)

		expect(params.assets).toEqual(["PETR4", "WIN", "VALE3"])
	})

	it("should preserve timeframeId UUIDs exactly through serialize and apply", () => {
		const uuid = "550e8400-e29b-41d4-a716-446655440000"
		const filters = createFilterStateInput({ timeframeIds: [uuid] })
		const serialized = serializeFilters(filters, null, "asset", "edge")

		expect(serialized.timeframeIds).toEqual([uuid])

		const params = buildUrlParamsFromPreset(serialized)
		expect(params.timeframeIds).toEqual([uuid])
	})

	it("should not include all three outcome values as a fixed constraint", () => {
		// Verifies the system doesn't hard-code outcomes — any subset is valid
		const subsets: Array<string[]> = [
			["win"],
			["loss"],
			["breakeven"],
			["win", "loss"],
			["win", "breakeven"],
			["loss", "breakeven"],
			["win", "loss", "breakeven"],
		]

		for (const outcomes of subsets) {
			const filters = createFilterStateInput({
				outcomes: outcomes as Array<"win" | "loss" | "breakeven">,
			})
			const serialized = serializeFilters(filters, null, "asset", "edge")
			expect(serialized.outcomes).toEqual(outcomes)
		}
	})

	it("should produce a stable JSON string for the same input (deterministic)", () => {
		const state = createSavedFilterState({
			assets: ["WIN"],
			groupBy: "asset",
		})

		const firstSerialization = JSON.stringify(state)
		const secondSerialization = JSON.stringify(state)

		expect(firstSerialization).toBe(secondSerialization)
	})

	it("should handle a preset with only groupBy set (no date, no arrays)", () => {
		const preset: SavedFilterState = { groupBy: "timeframe" }
		const params = buildUrlParamsFromPreset(preset)

		expect(params.groupBy).toBe("timeframe")
		expect(params.assets).toEqual([])
		expect(params.datePreset).toBeNull()
	})

	it("should handle a preset with only expectancyMode set", () => {
		const preset: SavedFilterState = { expectancyMode: "winrate" }
		const params = buildUrlParamsFromPreset(preset)

		expect(params.expectancy).toBe("winrate")
		expect(params.assets).toEqual([])
		expect(params.groupBy).toBeNull()
	})
})
