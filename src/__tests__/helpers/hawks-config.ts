/**
 * Test fixture: a complete HawksTripleScreenConfig with parquet-matching
 * defaults. Use this anywhere a test needs a baseline config — DO NOT
 * inline `{ ema27_60m_key: ..., ... }` literals; that style breaks every
 * time a new required key lands on the config type.
 *
 * Override individual fields via `makeHawksConfig({ macd_key: "..." })`.
 */
import type { HawksTripleScreenConfig } from "@/types/backtest"
import { DEFAULT_HAWKS_CONFIG } from "@/lib/enrichment/hawks-config"

const makeHawksConfig = (
	overrides: Partial<HawksTripleScreenConfig> = {}
): HawksTripleScreenConfig => ({
	...DEFAULT_HAWKS_CONFIG,
	...overrides,
})

export { DEFAULT_HAWKS_CONFIG, makeHawksConfig }
