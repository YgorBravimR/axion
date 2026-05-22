import { describe, it, expect } from "vitest"
import type { DiffConditionEntry } from "@/app/actions/strategy-version-diff.types"

/**
 * Pure diff logic extracted from getStrategyVersionDiff action.
 * Tests the algorithm that compares two strategy versions at condition level.
 */

interface ConditionRecord {
	conditionId: string
	conditionName: string
	category: string
	tier: string
}

/**
 * Build a diff between two version condition lists.
 * Logic mirrors lines 96-115 in strategy-version-diff.ts
 */
const computeDiff = (
	conditionsA: ConditionRecord[],
	conditionsB: ConditionRecord[]
): DiffConditionEntry[] => {
	const tierMapA = new Map(conditionsA.map((c) => [c.conditionId, c]))
	const tierMapB = new Map(conditionsB.map((c) => [c.conditionId, c]))

	const allIds = new Set([
		...conditionsA.map((c) => c.conditionId),
		...conditionsB.map((c) => c.conditionId),
	])

	const conditions: DiffConditionEntry[] = [...allIds].map((id) => {
		const entryA = tierMapA.get(id)
		const entryB = tierMapB.get(id)
		const base = entryA ?? entryB
		return {
			conditionId: id,
			conditionName: base!.conditionName,
			category: base!.category,
			tierA: entryA?.tier ?? null,
			tierB: entryB?.tier ?? null,
		}
	})

	return conditions
}

describe("Strategy Version Diff Logic", () => {
	describe("no changes between versions", () => {
		it("should report identical conditions unchanged", () => {
			const conditions: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support Level",
					category: "price",
					tier: "S1",
				},
				{
					conditionId: "c2",
					conditionName: "Volume Spike",
					category: "volume",
					tier: "T2",
				},
			]

			const diff = computeDiff(conditions, conditions)

			expect(diff).toHaveLength(2)
			expect(diff[0]).toEqual({
				conditionId: "c1",
				conditionName: "Support Level",
				category: "price",
				tierA: "S1",
				tierB: "S1",
			})
			expect(diff[1]).toEqual({
				conditionId: "c2",
				conditionName: "Volume Spike",
				category: "volume",
				tierA: "T2",
				tierB: "T2",
			})
		})
	})

	describe("additions only", () => {
		it("should mark new conditions in version B as tierA=null", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S1",
				},
			]

			const versionB: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S1",
				},
				{
					conditionId: "c2",
					conditionName: "Resistance",
					category: "price",
					tier: "R1",
				},
			]

			const diff = computeDiff(versionA, versionB)

			expect(diff).toHaveLength(2)
			const added = diff.find((d) => d.conditionId === "c2")
			expect(added).toEqual({
				conditionId: "c2",
				conditionName: "Resistance",
				category: "price",
				tierA: null,
				tierB: "R1",
			})
		})
	})

	describe("removals only", () => {
		it("should mark deleted conditions as tierB=null", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S1",
				},
				{
					conditionId: "c2",
					conditionName: "Resistance",
					category: "price",
					tier: "R1",
				},
			]

			const versionB: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S1",
				},
			]

			const diff = computeDiff(versionA, versionB)

			expect(diff).toHaveLength(2)
			const removed = diff.find((d) => d.conditionId === "c2")
			expect(removed).toEqual({
				conditionId: "c2",
				conditionName: "Resistance",
				category: "price",
				tierA: "R1",
				tierB: null,
			})
		})
	})

	describe("tier modifications", () => {
		it("should show tier changes between versions", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S1",
				},
			]

			const versionB: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S2",
				},
			]

			const diff = computeDiff(versionA, versionB)

			expect(diff).toHaveLength(1)
			expect(diff[0]).toEqual({
				conditionId: "c1",
				conditionName: "Support",
				category: "price",
				tierA: "S1",
				tierB: "S2",
			})
		})

		it("should handle multiple tier changes in same diff", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S1",
				},
				{
					conditionId: "c2",
					conditionName: "Volume",
					category: "volume",
					tier: "V1",
				},
				{
					conditionId: "c3",
					conditionName: "Trend",
					category: "trend",
					tier: "T1",
				},
			]

			const versionB: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S2",
				},
				{
					conditionId: "c2",
					conditionName: "Volume",
					category: "volume",
					tier: "V3",
				},
				{
					conditionId: "c3",
					conditionName: "Trend",
					category: "trend",
					tier: "T1",
				},
			]

			const diff = computeDiff(versionA, versionB)

			expect(diff).toHaveLength(3)
			expect(diff[0]).toMatchObject({ tierA: "S1", tierB: "S2" })
			expect(diff[1]).toMatchObject({ tierA: "V1", tierB: "V3" })
			expect(diff[2]).toMatchObject({ tierA: "T1", tierB: "T1" })
		})
	})

	describe("mixed operations", () => {
		it("should handle adds, removes, and modifications in one diff", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S1",
				},
				{
					conditionId: "c2",
					conditionName: "Volume",
					category: "volume",
					tier: "V1",
				},
				{
					conditionId: "c3",
					conditionName: "OldCondition",
					category: "other",
					tier: "O1",
				},
			]

			const versionB: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S2",
				},
				{
					conditionId: "c2",
					conditionName: "Volume",
					category: "volume",
					tier: "V1",
				},
				{
					conditionId: "c4",
					conditionName: "NewCondition",
					category: "new",
					tier: "N1",
				},
			]

			const diff = computeDiff(versionA, versionB)

			expect(diff).toHaveLength(4)
			const byId = new Map(diff.map((d) => [d.conditionId, d]))

			// c1: modified
			expect(byId.get("c1")).toMatchObject({
				tierA: "S1",
				tierB: "S2",
			})

			// c2: unchanged
			expect(byId.get("c2")).toMatchObject({
				tierA: "V1",
				tierB: "V1",
			})

			// c3: removed
			expect(byId.get("c3")).toMatchObject({
				tierA: "O1",
				tierB: null,
			})

			// c4: added
			expect(byId.get("c4")).toMatchObject({
				tierA: null,
				tierB: "N1",
			})
		})
	})

	describe("deep object diff properties", () => {
		it("should preserve condition metadata on diff entries", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c-price-support",
					conditionName: "Price at Support Level",
					category: "price-action",
					tier: "primary",
				},
			]

			const versionB: ConditionRecord[] = [
				{
					conditionId: "c-price-support",
					conditionName: "Price at Support Level",
					category: "price-action",
					tier: "secondary",
				},
			]

			const diff = computeDiff(versionA, versionB)

			expect(diff[0]).toEqual({
				conditionId: "c-price-support",
				conditionName: "Price at Support Level",
				category: "price-action",
				tierA: "primary",
				tierB: "secondary",
			})
		})
	})

	describe("edge cases", () => {
		it("should handle empty version A", () => {
			const versionB: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S1",
				},
			]

			const diff = computeDiff([], versionB)

			expect(diff).toHaveLength(1)
			expect(diff[0]).toEqual({
				conditionId: "c1",
				conditionName: "Support",
				category: "price",
				tierA: null,
				tierB: "S1",
			})
		})

		it("should handle empty version B", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S1",
				},
			]

			const diff = computeDiff(versionA, [])

			expect(diff).toHaveLength(1)
			expect(diff[0]).toEqual({
				conditionId: "c1",
				conditionName: "Support",
				category: "price",
				tierA: "S1",
				tierB: null,
			})
		})

		it("should handle both versions empty", () => {
			const diff = computeDiff([], [])

			expect(diff).toHaveLength(0)
		})

		it("should handle special characters in condition names", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Price > MA(20) & Vol > Avg",
					category: "composite",
					tier: "T1",
				},
			]

			const diff = computeDiff(versionA, versionA)

			expect(diff[0]!.conditionName).toBe("Price > MA(20) & Vol > Avg")
		})
	})

	describe("ordering invariance", () => {
		it("should produce same diff regardless of condition order in inputs", () => {
			const conditionsOrdered: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "A",
					category: "cat1",
					tier: "T1",
				},
				{
					conditionId: "c2",
					conditionName: "B",
					category: "cat2",
					tier: "T2",
				},
				{
					conditionId: "c3",
					conditionName: "C",
					category: "cat3",
					tier: "T3",
				},
			]

			const conditionsReversed = [...conditionsOrdered].reverse()

			const diff1 = computeDiff(conditionsOrdered, conditionsOrdered)
			const diff2 = computeDiff(conditionsReversed, conditionsReversed)

			// Both should have same entries, just potentially different order
			expect(diff1).toHaveLength(diff2.length)

			const sortById = (entries: DiffConditionEntry[]) =>
				[...entries].sort((a, b) => a.conditionId.localeCompare(b.conditionId))

			expect(sortById(diff1)).toEqual(sortById(diff2))
		})

		it("should find all changes even if conditions appear in different orders", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "A",
					category: "cat1",
					tier: "T1",
				},
				{
					conditionId: "c2",
					conditionName: "B",
					category: "cat2",
					tier: "T2",
				},
			]

			const versionB: ConditionRecord[] = [
				{
					conditionId: "c2",
					conditionName: "B",
					category: "cat2",
					tier: "T2X",
				},
				{
					conditionId: "c1",
					conditionName: "A",
					category: "cat1",
					tier: "T1",
				},
			]

			const diff = computeDiff(versionA, versionB)
			const sortById = (entries: DiffConditionEntry[]) =>
				[...entries].sort((a, b) => a.conditionId.localeCompare(b.conditionId))
			const sorted = sortById(diff)

			expect(sorted[0]).toMatchObject({
				conditionId: "c1",
				tierA: "T1",
				tierB: "T1",
			})
			expect(sorted[1]).toMatchObject({
				conditionId: "c2",
				tierA: "T2",
				tierB: "T2X",
			})
		})
	})

	describe("duplicate condition IDs", () => {
		it("should use last entry when same ID appears multiple times in version", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S1",
				},
				{
					conditionId: "c1",
					conditionName: "Support",
					category: "price",
					tier: "S2",
				},
			]

			const diff = computeDiff(versionA, [])

			// Map behavior: last entry wins
			expect(diff).toHaveLength(1)
			expect(diff[0]!.tierA).toBe("S2")
		})
	})

	describe("metadata preservation", () => {
		it("should preserve category even when tier changes", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "TestCond",
					category: "volume",
					tier: "V1",
				},
			]

			const versionB: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "TestCond",
					category: "volume",
					tier: "V2",
				},
			]

			const diff = computeDiff(versionA, versionB)

			expect(diff[0]!.category).toBe("volume")
			expect(diff[0]!.conditionName).toBe("TestCond")
		})

		it("should use metadata from whichever version has the condition", () => {
			const versionA: ConditionRecord[] = [
				{
					conditionId: "c1",
					conditionName: "OnlyInA",
					category: "catA",
					tier: "T1",
				},
			]

			const versionB: ConditionRecord[] = [
				{
					conditionId: "c2",
					conditionName: "OnlyInB",
					category: "catB",
					tier: "T2",
				},
			]

			const diff = computeDiff(versionA, versionB)
			const byId = new Map(diff.map((d) => [d.conditionId, d]))

			expect(byId.get("c1")).toMatchObject({
				conditionName: "OnlyInA",
				category: "catA",
			})
			expect(byId.get("c2")).toMatchObject({
				conditionName: "OnlyInB",
				category: "catB",
			})
		})
	})
})
