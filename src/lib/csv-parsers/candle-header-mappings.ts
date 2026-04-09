/**
 * ProfitChart CSV column header mappings for candle data.
 * Maps Portuguese CSV headers to JSONB indicator keys and groups.
 */

interface IndicatorMapping {
	key: string
	displayName: string
	csvHeader: string
	groupKey: string
}

interface IndicatorGroupMeta {
	key: string
	displayName: string
	description: string
}

/**
 * Set of normalized header strings that identify fixed OHLC columns.
 * These are NOT indicators — they map to the structured candle fields.
 *
 * "fechamento" is only OHLC when it appears as the 5th column;
 * "fechamento dia anterior" is an indicator (handled separately).
 */
const OHLC_HEADERS = new Set([
	"data",
	"abertura",
	"maxima",
	"máxima",
	"minima",
	"mínima",
	"fechamento",
	"contador de candles",
	"contador_de_candles",
])

/**
 * All known ProfitChart indicator mappings.
 * Each entry maps a CSV header to a stable JSONB key and group.
 */
const KNOWN_INDICATOR_MAPPINGS: IndicatorMapping[] = [
	// VWAP indicators
	{ key: "vwap_m", displayName: "VWAP M", csvHeader: "VWAP M", groupKey: "vwap" },
	{ key: "vwap_s", displayName: "VWAP S", csvHeader: "VWAP S", groupKey: "vwap" },
	{ key: "vwap_d", displayName: "VWAP D", csvHeader: "VWAP D", groupKey: "vwap" },

	// Trava levels
	{ key: "trava_0", displayName: "TRAVA 0", csvHeader: "TRAVA 0", groupKey: "trava" },
	{ key: "trava_1", displayName: "TRAVA 1", csvHeader: "TRAVA 1", groupKey: "trava" },
	{ key: "trava_2", displayName: "TRAVA 2", csvHeader: "TRAVA 2", groupKey: "trava" },
	{ key: "trava_3", displayName: "TRAVA 3", csvHeader: "TRAVA 3", groupKey: "trava" },
	{ key: "trava_4", displayName: "TRAVA 4", csvHeader: "TRAVA 4", groupKey: "trava" },
	{ key: "trava_5", displayName: "TRAVA 5", csvHeader: "TRAVA 5", groupKey: "trava" },
	{ key: "trava_neg1", displayName: "TRAVA -1", csvHeader: "TRAVA -1", groupKey: "trava" },
	{ key: "trava_neg2", displayName: "TRAVA -2", csvHeader: "TRAVA -2", groupKey: "trava" },
	{ key: "trava_neg3", displayName: "TRAVA -3", csvHeader: "TRAVA -3", groupKey: "trava" },
	{ key: "trava_neg4", displayName: "TRAVA -4", csvHeader: "TRAVA -4", groupKey: "trava" },
	{ key: "trava_neg5", displayName: "TRAVA -5", csvHeader: "TRAVA -5", groupKey: "trava" },

	// Strategy levels
	{ key: "entrada", displayName: "ENTRADA", csvHeader: "ENTRADA", groupKey: "strategy_level" },
	{ key: "stop", displayName: "STOP", csvHeader: "STOP", groupKey: "strategy_level" },
	{ key: "alvo_final", displayName: "ALVO FINAL", csvHeader: "ALVO FINAL", groupKey: "strategy_level" },
	{
		key: "breakeven_trailing",
		displayName: "BREAKEVEN + TRAILING STOP",
		csvHeader: "BREAKEVEN + TRAILING STOP",
		groupKey: "strategy_level",
	},
	{
		key: "breakeven_trigger",
		displayName: "BREAKEVEN TRIGGER",
		csvHeader: "BREAKEVEN TRIGGER",
		groupKey: "strategy_level",
	},
	{
		key: "trailing_trigger",
		displayName: "TRAILLING STOP TRIGGER",
		csvHeader: "TRAILLING STOP TRIGGER",
		groupKey: "strategy_level",
	},

	// Technical indicators
	{
		key: "ema_200",
		displayName: "Média Móvel E [200]",
		csvHeader: "Média Móvel E [200]",
		groupKey: "technical",
	},

	// Percent levels
	{ key: "percent_1", displayName: "Percent 1", csvHeader: "Percent 1", groupKey: "percent" },
	{ key: "percent_neg1", displayName: "Percent -1", csvHeader: "Percent -1", groupKey: "percent" },
	{ key: "percent_2", displayName: "Percent 2", csvHeader: "Percent 2", groupKey: "percent" },
	{ key: "percent_3", displayName: "Percent 3", csvHeader: "Percent 3", groupKey: "percent" },
	{ key: "percent_neg2", displayName: "Percent -2", csvHeader: "Percent -2", groupKey: "percent" },
	{ key: "percent_neg3", displayName: "Percent -3", csvHeader: "Percent -3", groupKey: "percent" },

	// Daily reference levels
	{ key: "ajuste", displayName: "Ajuste", csvHeader: "Ajuste", groupKey: "daily_reference" },
	{
		key: "prev_day_close",
		displayName: "Fechamento dia anterior",
		csvHeader: "Fechamento dia anterior",
		groupKey: "daily_reference",
	},
	{
		key: "prev_day_high",
		displayName: "Maxima dia anterior",
		csvHeader: "Maxima dia anterior",
		groupKey: "daily_reference",
	},
	{
		key: "prev_day_low",
		displayName: "Minima dia anterior",
		csvHeader: "Minima dia anterior",
		groupKey: "daily_reference",
	},
]

/**
 * All known indicator group metadata.
 * Each entry defines a logical grouping for indicator mappings.
 */
const KNOWN_INDICATOR_GROUPS: IndicatorGroupMeta[] = [
	{ key: "vwap", displayName: "VWAPs", description: "Volume-weighted average prices at different periods" },
	{ key: "trava", displayName: "Travas", description: "Offset levels from settlement price" },
	{
		key: "strategy_level",
		displayName: "Niveis de Estrategia",
		description: "Entry, stop, target, breakeven levels",
	},
	{
		key: "technical",
		displayName: "Indicadores Tecnicos",
		description: "Moving averages and other technical indicators",
	},
	{ key: "percent", displayName: "Percentuais", description: "Percentage offset levels from settlement" },
	{
		key: "daily_reference",
		displayName: "Referencia Diaria",
		description: "Previous day OHLC and settlement",
	},
]

/**
 * Normalize a string for accent-insensitive, case-insensitive comparison.
 * Strips diacritics via NFD decomposition and lowercases.
 */
const normalizeForComparison = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")

/**
 * Resolve a CSV header to a known indicator mapping.
 * Matches case-insensitively with accent normalization.
 *
 * @param csvHeader - The raw CSV column header
 * @returns The matching IndicatorMapping, or null if not a known indicator
 */
const resolveIndicatorKey = (csvHeader: string): IndicatorMapping | null => {
	const normalized = normalizeForComparison(csvHeader)

	for (const mapping of KNOWN_INDICATOR_MAPPINGS) {
		if (normalizeForComparison(mapping.csvHeader) === normalized) {
			return mapping
		}
	}

	return null
}

/**
 * Convert an unknown CSV header to a valid JSONB key.
 * Lowercases, replaces spaces and special characters with underscores,
 * and collapses consecutive underscores.
 *
 * @param header - The raw CSV column header
 * @returns A slugified key suitable for JSONB storage
 */
const slugifyHeader = (header: string): string =>
	header
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_|_$/g, "")

export type { IndicatorGroupMeta, IndicatorMapping }
export { KNOWN_INDICATOR_GROUPS, KNOWN_INDICATOR_MAPPINGS, OHLC_HEADERS, resolveIndicatorKey, slugifyHeader }
