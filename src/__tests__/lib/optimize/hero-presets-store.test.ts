import { describe, it, expect, beforeEach, beforeAll } from "vitest"
import type { HeroWinPreset, StrategyRecipe } from "@/types/backtest"

// Polyfill localStorage + window for node test environment. The store reads
// `typeof window === "undefined"` to skip persistence, so we must provide both.
beforeAll(() => {
	const store: Record<string, string> = {}
	const stub = {
		getItem: (k: string) => store[k] ?? null,
		setItem: (k: string, v: string) => {
			store[k] = v
		},
		removeItem: (k: string) => {
			delete store[k]
		},
		clear: () => {
			for (const k of Object.keys(store)) {
				delete store[k]
			}
		},
		get length() {
			return Object.keys(store).length
		},
		key: (i: number) => Object.keys(store)[i] ?? null,
	}
	;(globalThis as unknown as { localStorage: typeof stub }).localStorage = stub
	;(globalThis as unknown as { window: { localStorage: typeof stub } }).window =
		{
			localStorage: stub,
		}
})

// Late import so the module reads the polyfilled globals (env-guarded internally).
const {
	hydrate,
	listHeroPresets,
	addHeroPreset,
	removeHeroPreset,
	subscribe,
	__resetHeroPresetsStoreForTest,
} = await import("@/lib/optimize/hero-presets-store")

const preset = (
	id: string,
	overrides: Partial<HeroWinPreset> = {}
): HeroWinPreset => ({
	presetId: id,
	sourcePresetId: "hawks_v0",
	recipe: { displayName: id } as StrategyRecipe,
	frozenAt: "2026-05-30T00:00:00Z",
	journeyId: "j-test",
	engineVersion: "v0.5",
	metrics: {
		profitFactor: 1.8,
		trades: 50,
		oosRobust: true,
		maxDrawdownCents: -500,
		winRate: 64,
	},
	...overrides,
})

beforeEach(() => {
	__resetHeroPresetsStoreForTest()
})

describe("hero-presets-store", () => {
	it("hydrate() with no localStorage entry produces empty cache", () => {
		hydrate()
		expect(listHeroPresets()).toEqual([])
	})

	it("addHeroPreset persists to localStorage and updates cache", () => {
		addHeroPreset(preset("hawks_v0_tuned_2026-05-30"))
		expect(listHeroPresets()).toHaveLength(1)
		expect(listHeroPresets()[0]?.presetId).toBe("hawks_v0_tuned_2026-05-30")
	})

	it("re-hydrating from localStorage returns the previously added presets", () => {
		addHeroPreset(preset("a"))
		addHeroPreset(preset("b"))
		__resetHeroPresetsStoreForTest()
		// simulate a different session: write the same envelope manually
		localStorage.setItem(
			"axion:optimize:heroPresets",
			JSON.stringify({
				schemaVersion: 1,
				presets: [preset("a"), preset("b")],
			})
		)
		hydrate()
		expect(
			listHeroPresets()
				.map((p) => p.presetId)
				.sort()
		).toEqual(["a", "b"])
	})

	it("addHeroPreset deduplicates by presetId (upsert semantics)", () => {
		addHeroPreset(preset("a", { notes: "original" }))
		addHeroPreset(preset("a", { notes: "updated" }))
		const all = listHeroPresets()
		expect(all).toHaveLength(1)
		expect(all[0]?.notes).toBe("updated")
	})

	it("removeHeroPreset by id drops the entry from cache and localStorage", () => {
		addHeroPreset(preset("a"))
		addHeroPreset(preset("b"))
		removeHeroPreset("a")
		expect(listHeroPresets().map((p) => p.presetId)).toEqual(["b"])
	})

	it("subscribe receives a notification on add", () => {
		hydrate() // hydrate first; the test starts after the boot-time notification
		let count = 0
		const unsub = subscribe(() => {
			count++
		})
		addHeroPreset(preset("a"))
		addHeroPreset(preset("b"))
		expect(count).toBe(2)
		unsub()
		addHeroPreset(preset("c"))
		expect(count).toBe(2)
	})

	it("legacy bare-array payload hydrates as v1 entries", () => {
		__resetHeroPresetsStoreForTest()
		localStorage.setItem(
			"axion:optimize:heroPresets",
			JSON.stringify([preset("legacy")])
		)
		hydrate()
		expect(listHeroPresets().map((p) => p.presetId)).toEqual(["legacy"])
	})

	it("unknown schemaVersion in envelope is treated as no data", () => {
		__resetHeroPresetsStoreForTest()
		localStorage.setItem(
			"axion:optimize:heroPresets",
			JSON.stringify({ schemaVersion: 999, presets: [preset("future")] })
		)
		hydrate()
		expect(listHeroPresets()).toEqual([])
	})
})
