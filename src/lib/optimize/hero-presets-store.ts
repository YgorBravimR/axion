/**
 * Hero-presets store — hybrid in-memory cache + localStorage truth.
 *
 * Per the locked /plan-eng-review decision (Issue 1.D, 2026-05-30):
 *
 *   "Maintain a separate in-memory `heroPresetsCache` registered alongside
 *    ALL_PRESETS. On freeze, write to localStorage AND update the cache. On
 *    app boot, hydrate cache from localStorage. Adds a hydration step but
 *    avoids per-render localStorage reads."
 *
 * Surface:
 *   - `hydrate()`            — call once at app boot to populate cache.
 *   - `listHeroPresets()`    — synchronous read from cache.
 *   - `addHeroPreset(p)`     — write-through (cache + localStorage).
 *   - `removeHeroPreset(id)` — write-through delete.
 *   - `subscribe(cb)`        — observe cache changes (returns unsubscribe).
 *
 * Schema versioning: presets carry the schema version they were written
 * under. Future migrations transform older entries on hydrate. Today the
 * shape is v1; bumping is only required for non-backward-compatible changes.
 */
import type { HeroWinPreset } from "@/types/backtest"

const STORAGE_KEY = "axion:optimize:heroPresets"
const STORAGE_VERSION_KEY = "axion:optimize:heroPresetsSchemaVersion"
const HERO_PRESETS_SCHEMA_VERSION = 1

interface StoredEnvelope {
	schemaVersion: number
	presets: HeroWinPreset[]
}

let cache: HeroWinPreset[] = []
let hydrated = false
const subscribers = new Set<() => void>()

const notifySubscribers = (): void => {
	for (const cb of subscribers) {
		cb()
	}
}

const readFromStorage = (): HeroWinPreset[] => {
	if (typeof window === "undefined") {
		return []
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) {
			return []
		}
		const parsed = JSON.parse(raw) as StoredEnvelope | HeroWinPreset[]
		// Legacy: pre-envelope payload was a bare array — treat as v1.
		if (Array.isArray(parsed)) {
			return parsed
		}
		// Future-proof: schemaVersion mismatch triggers migration. Today we have
		// only v1, so unknown versions return empty (safer than corrupted runs).
		if (parsed.schemaVersion !== HERO_PRESETS_SCHEMA_VERSION) {
			return []
		}
		return parsed.presets
	} catch {
		return []
	}
}

const writeToStorage = (presets: HeroWinPreset[]): void => {
	if (typeof window === "undefined") {
		return
	}
	try {
		const envelope: StoredEnvelope = {
			schemaVersion: HERO_PRESETS_SCHEMA_VERSION,
			presets,
		}
		localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
		localStorage.setItem(
			STORAGE_VERSION_KEY,
			String(HERO_PRESETS_SCHEMA_VERSION)
		)
	} catch {
		// quota — cache stays the source of truth in memory
	}
}

const hydrate = (): void => {
	if (hydrated) {
		return
	}
	cache = readFromStorage()
	hydrated = true
	notifySubscribers()
}

const listHeroPresets = (): HeroWinPreset[] => {
	if (!hydrated) {
		hydrate()
	}
	return cache
}

const addHeroPreset = (preset: HeroWinPreset): void => {
	if (!hydrated) {
		hydrate()
	}
	const next = [...cache.filter((p) => p.presetId !== preset.presetId), preset]
	cache = next
	writeToStorage(next)
	notifySubscribers()
}

const removeHeroPreset = (presetId: string): void => {
	if (!hydrated) {
		hydrate()
	}
	const next = cache.filter((p) => p.presetId !== presetId)
	cache = next
	writeToStorage(next)
	notifySubscribers()
}

const subscribe = (cb: () => void): (() => void) => {
	subscribers.add(cb)
	return () => subscribers.delete(cb)
}

/** Testing helper — reset the module state. Not exported through the barrel. */
const __resetHeroPresetsStoreForTest = (): void => {
	cache = []
	hydrated = false
	subscribers.clear()
	if (typeof window !== "undefined") {
		localStorage.removeItem(STORAGE_KEY)
		localStorage.removeItem(STORAGE_VERSION_KEY)
	}
}

export {
	hydrate,
	listHeroPresets,
	addHeroPreset,
	removeHeroPreset,
	subscribe,
	HERO_PRESETS_SCHEMA_VERSION,
	__resetHeroPresetsStoreForTest,
}
