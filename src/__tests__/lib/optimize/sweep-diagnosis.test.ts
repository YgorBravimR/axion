import { describe, it, expect } from "vitest"
import {
	diagnoseSweepAxes,
	countByStatus,
	groupLockedByOwner,
} from "@/lib/optimize/sweep-diagnosis"
import type { LeafSelection, SweepableLeaf } from "@/lib/optimize/sweep-leaf"

const numLeaf = (
	path: string,
	overrides: Partial<SweepableLeaf> = {}
): SweepableLeaf =>
	({
		kind: "number",
		path,
		labelKey: path,
		defaultMin: 1,
		defaultMax: 10,
		defaultStep: 1,
		...overrides,
	}) as SweepableLeaf

const boolLeaf = (
	path: string,
	overrides: Partial<SweepableLeaf> = {}
): SweepableLeaf =>
	({
		kind: "bool",
		path,
		labelKey: path,
		...overrides,
	}) as SweepableLeaf

const enumLeaf = (
	path: string,
	options: string[],
	overrides: Partial<SweepableLeaf> = {}
): SweepableLeaf =>
	({
		kind: "enum",
		path,
		labelKey: path,
		options: options.map((v) => ({ value: v, labelKey: v })),
		...overrides,
	}) as SweepableLeaf

describe("diagnoseSweepAxes", () => {
	it("returns empty when no selections are in sweep mode", () => {
		const leaves = [numLeaf("a")]
		const sel = new Map<string, LeafSelection>([
			["a", { kind: "fixed", value: 5 }],
		])
		expect(diagnoseSweepAxes(leaves, sel)).toEqual([])
	})

	it("marks a number sweep as active with the correct value count", () => {
		const leaves = [numLeaf("a")]
		const sel = new Map<string, LeafSelection>([
			["a", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
		])
		const out = diagnoseSweepAxes(leaves, sel)
		expect(out).toHaveLength(1)
		expect(out[0]?.status).toBe("active")
		expect(out[0]?.valueCount).toBe(3)
	})

	it("marks a bool sweep as active with 2 values", () => {
		const leaves = [boolLeaf("b")]
		const sel = new Map<string, LeafSelection>([
			["b", { kind: "sweep_set", values: [true, false] }],
		])
		const out = diagnoseSweepAxes(leaves, sel)
		expect(out[0]?.status).toBe("active")
		expect(out[0]?.valueCount).toBe(2)
	})

	it("locks an owned leaf when owner is fixed to non-custom", () => {
		const owner = enumLeaf("bundle", ["off", "custom"])
		const owned = numLeaf("child", { managedBy: "bundle" })
		const sel = new Map<string, LeafSelection>([
			["bundle", { kind: "fixed", value: "off" }],
			["child", { kind: "sweep_range", min: 1, max: 5, step: 1 }],
		])
		const out = diagnoseSweepAxes([owner, owned], sel)
		expect(out[0]?.status).toBe("locked")
		expect(out[0]?.ownerPath).toBe("bundle")
		expect(out[0]?.ownerValue).toBe("off")
	})

	it("does not lock when owner is fixed to custom", () => {
		const owner = enumLeaf("bundle", ["off", "custom"])
		const owned = numLeaf("child", { managedBy: "bundle" })
		const sel = new Map<string, LeafSelection>([
			["bundle", { kind: "fixed", value: "custom" }],
			["child", { kind: "sweep_range", min: 1, max: 5, step: 1 }],
		])
		const out = diagnoseSweepAxes([owner, owned], sel)
		expect(out[0]?.status).toBe("active")
		expect(out[0]?.valueCount).toBe(5)
	})

	it("does not lock when owner is itself in sweep mode", () => {
		const owner = enumLeaf("bundle", ["off", "custom"])
		const owned = numLeaf("child", { managedBy: "bundle" })
		const sel = new Map<string, LeafSelection>([
			["bundle", { kind: "sweep_set", values: ["off", "custom"] }],
			["child", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
		])
		const out = diagnoseSweepAxes([owner, owned], sel)
		// Both bundle (sweep) and child (sweep) show; child reports active
		// because the sweep parent will satisfy at least one combo.
		const childRow = out.find((d) => d.leafPath === "child")
		expect(childRow?.status).toBe("active")
	})

	it("gates a leaf when parent is fixed to a disallowed value", () => {
		const parent = enumLeaf("mode", ["off", "on"])
		const child = numLeaf("thresh", {
			condition: { parentPath: "mode", allowedValues: ["on"] },
		})
		const sel = new Map<string, LeafSelection>([
			["mode", { kind: "fixed", value: "off" }],
			["thresh", { kind: "sweep_range", min: 1, max: 5, step: 1 }],
		])
		const out = diagnoseSweepAxes([parent, child], sel)
		expect(out[0]?.status).toBe("gated")
		expect(out[0]?.conditionParentPath).toBe("mode")
		expect(out[0]?.conditionParentValue).toBe("off")
	})

	it("does not gate when parent is in sweep mode (some combo will satisfy)", () => {
		const parent = enumLeaf("mode", ["off", "on"])
		const child = numLeaf("thresh", {
			condition: { parentPath: "mode", allowedValues: ["on"] },
		})
		const sel = new Map<string, LeafSelection>([
			["mode", { kind: "sweep_set", values: ["off", "on"] }],
			["thresh", { kind: "sweep_range", min: 1, max: 5, step: 1 }],
		])
		const out = diagnoseSweepAxes([parent, child], sel)
		const childRow = out.find((d) => d.leafPath === "thresh")
		expect(childRow?.status).toBe("active")
	})

	it("locks when owner is in sweep mode without the custom escape value", () => {
		const owner = enumLeaf("bundle", ["off", "balanced", "custom"])
		const owned = numLeaf("child", { managedBy: "bundle" })
		const sel = new Map<string, LeafSelection>([
			["bundle", { kind: "sweep_set", values: ["off", "balanced"] }],
			["child", { kind: "sweep_range", min: 1, max: 5, step: 1 }],
		])
		const out = diagnoseSweepAxes([owner, owned], sel)
		const childRow = out.find((d) => d.leafPath === "child")
		expect(childRow?.status).toBe("locked")
		expect(childRow?.ownerPath).toBe("bundle")
	})

	it("locks when owner is in sweep mode with a single non-custom value", () => {
		const owner = enumLeaf("bundle", ["off", "custom"])
		const owned = numLeaf("child", { managedBy: "bundle" })
		const sel = new Map<string, LeafSelection>([
			["bundle", { kind: "sweep_set", values: ["off"] }],
			["child", { kind: "sweep_range", min: 1, max: 5, step: 1 }],
		])
		const out = diagnoseSweepAxes([owner, owned], sel)
		const childRow = out.find((d) => d.leafPath === "child")
		expect(childRow?.status).toBe("locked")
		expect(childRow?.ownerValue).toBe("off")
	})

	it("owner-lock takes precedence over conditional gate", () => {
		const owner = enumLeaf("bundle", ["off", "custom"])
		const child = numLeaf("g", {
			managedBy: "bundle",
			condition: { parentPath: "bundle", allowedValues: ["custom"] },
		})
		const sel = new Map<string, LeafSelection>([
			["bundle", { kind: "fixed", value: "off" }],
			["g", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
		])
		const out = diagnoseSweepAxes([owner, child], sel)
		expect(out[0]?.status).toBe("locked")
	})
})

describe("groupLockedByOwner", () => {
	it("groups multiple locked leaves under the same owner", () => {
		const owner = enumLeaf("bundle", ["off", "custom"])
		const a = numLeaf("a", { managedBy: "bundle" })
		const b = numLeaf("b", { managedBy: "bundle" })
		const sel = new Map<string, LeafSelection>([
			["bundle", { kind: "fixed", value: "off" }],
			["a", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
			["b", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
		])
		const groups = groupLockedByOwner(diagnoseSweepAxes([owner, a, b], sel))
		expect(groups).toHaveLength(1)
		expect(groups[0]?.ownerPath).toBe("bundle")
		expect(groups[0]?.ownerValue).toBe("off")
		expect(groups[0]?.leafPaths.sort()).toEqual(["a", "b"])
	})

	it("returns an empty array when no axes are locked", () => {
		const owner = enumLeaf("bundle", ["custom"])
		const a = numLeaf("a", { managedBy: "bundle" })
		const sel = new Map<string, LeafSelection>([
			["bundle", { kind: "fixed", value: "custom" }],
			["a", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
		])
		expect(groupLockedByOwner(diagnoseSweepAxes([owner, a], sel))).toEqual([])
	})

	it("creates separate groups per owner when multiple owners lock", () => {
		const o1 = enumLeaf("b1", ["off", "custom"])
		const o2 = enumLeaf("b2", ["off", "custom"])
		const a = numLeaf("a", { managedBy: "b1" })
		const b = numLeaf("b", { managedBy: "b2" })
		const sel = new Map<string, LeafSelection>([
			["b1", { kind: "fixed", value: "off" }],
			["b2", { kind: "fixed", value: "off" }],
			["a", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
			["b", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
		])
		const groups = groupLockedByOwner(diagnoseSweepAxes([o1, o2, a, b], sel))
		expect(groups).toHaveLength(2)
		expect(groups.map((g) => g.ownerPath).sort()).toEqual(["b1", "b2"])
	})
})

describe("countByStatus", () => {
	it("counts each status category", () => {
		const owner = enumLeaf("bundle", ["off", "custom"])
		const a = numLeaf("a")
		const b = numLeaf("b", { managedBy: "bundle" })
		const c = numLeaf("c", {
			condition: { parentPath: "bundle", allowedValues: ["custom"] },
		})
		const sel = new Map<string, LeafSelection>([
			["bundle", { kind: "fixed", value: "off" }],
			["a", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
			["b", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
			["c", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
		])
		const counts = countByStatus(diagnoseSweepAxes([owner, a, b, c], sel))
		expect(counts).toEqual({ active: 1, locked: 1, gated: 1 })
	})
})
