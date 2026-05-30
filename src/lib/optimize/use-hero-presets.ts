"use client"

import { useSyncExternalStore } from "react"
import { listHeroPresets, subscribe, hydrate } from "./hero-presets-store"
import type { HeroWinPreset } from "@/types/backtest"

/**
 * Subscribe to the hero-presets cache from React. Hydrates on first render
 * (no-op after that). Uses `useSyncExternalStore` for concurrent-mode safety.
 *
 * Server snapshot returns an empty array — hero presets are localStorage-only,
 * so there's nothing to render server-side.
 */
const useHeroPresets = (): HeroWinPreset[] => {
	return useSyncExternalStore(
		(cb) => {
			hydrate()
			return subscribe(cb)
		},
		() => listHeroPresets(),
		() => []
	)
}

export { useHeroPresets }
