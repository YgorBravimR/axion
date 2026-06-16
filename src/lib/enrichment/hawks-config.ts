import type { HawksTripleScreenConfig } from "@/types/backtest"

/**
 * Production default Hawks Triple Screen config.
 * Used by enrichment engine and available for tests.
 * Matches parquet column names and defaults from all prior backtest runs.
 */
const DEFAULT_HAWKS_CONFIG: HawksTripleScreenConfig = {
	// HTF gate keys (match parquet column names verbatim).
	ema27_60m_key: "mme27_60m",
	ema55_60m_key: "mme55_60m",
	ema27_15m_key: "mme27_15m",
	ema55_15m_key: "mme55_15m",
	prev_15m_open_key: "prev_15m_open",
	prev_15m_close_key: "prev_15m_close",
	prev_60m_open_key: "prev_60m_open",
	prev_60m_close_key: "prev_60m_close",
	// Quality-indicator keys (match parquet column names verbatim).
	macd_key: "macd1_histo",
	vwap_d_key: "vwap_d",
	vwap_m_key: "vwap_m",
	vwap_w_key: "vwap_w",
	ajuste_key: "ajuste",
	keltner_inner_inf_key: "kc1_inf",
	keltner_inner_sup_key: "kc1_sup",
	keltner_outer_inf_key: "kc2_inf",
	keltner_outer_sup_key: "kc2_sup",
	aggression_key: "agr_saldo",
	volume_key: "volume_fin",
	// Numeric defaults.
	brickSize5mPoints: 100,
	startTime: 900,
	endTime: 1730,
}

export { DEFAULT_HAWKS_CONFIG }
