"use client"

import { useSyncExternalStore } from "react"
import { listHeroPresets, subscribe, hydrate } from "./hero-presets-store"
import type { HeroWinPreset } from "@/types/backtest"

// Stable empty-array reference for SSR. Returning a fresh `[]` literal from
// `getServerSnapshot` trips React's "The result of getServerSnapshot should be
// cached to avoid an infinite loop" warning because identity changes each call.
const SERVER_SNAPSHOT: HeroWinPreset[] = []

const getServerSnapshot = (): HeroWinPreset[] => SERVER_SNAPSHOT

/**
 * Subscribe to the hero-presets cache from React. Hydrates on first render
 * (no-op after that). Uses `useSyncExternalStore` for concurrent-mode safety.
 *
 * Server snapshot returns the same empty-array reference every call (see above).
 */
const useHeroPresets = (): HeroWinPreset[] => {
	return useSyncExternalStore(
		(cb) => {
			hydrate()
			return subscribe(cb)
		},
		listHeroPresets,
		getServerSnapshot
	)
}

export { useHeroPresets }
