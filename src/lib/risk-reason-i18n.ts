/**
 * Translates risk reason keys stored by the simulation engine.
 *
 * The engine stores reasons in three formats:
 *   1. Full i18n paths: "riskSimulation.reasons.t1BaseRisk"
 *   2. Pipe-separated params: "riskSimulation.reasons.gainReinvest|25"
 *   3. Raw status enums (for skipped trades): "skipped_daily_target"
 *
 * This helper normalizes all formats and resolves them via the
 * `useTranslations("riskSimulation")` hook.
 */

type TranslateFn = (key: string, values?: Record<string, string | number>) => string

/**
 * Translates a raw riskReason string using the provided `t` function
 * scoped to the "riskSimulation" namespace.
 *
 * @param t - useTranslations("riskSimulation") return value
 * @param raw - e.g. "riskSimulation.reasons.t1BaseRisk", "riskSimulation.reasons.gainReinvest|25", or "skipped_daily_target"
 */
const translateRiskReason = (t: TranslateFn, raw: string | null | undefined): string => {
	if (!raw) return "—"

	// Raw status enum values (skipped trades) → resolve via table.statuses.*
	if (raw.startsWith("skipped_")) {
		return t(`table.statuses.${raw}`)
	}

	// Strip the "riskSimulation." prefix if present
	const stripped = raw.startsWith("riskSimulation.") ? raw.slice("riskSimulation.".length) : raw

	// Check for pipe-separated parameter (e.g. "reasons.gainReinvest|25")
	const pipeIndex = stripped.indexOf("|")

	if (pipeIndex === -1) {
		return t(stripped)
	}

	const key = stripped.slice(0, pipeIndex)
	const paramValue = stripped.slice(pipeIndex + 1)

	return t(key, { percent: paramValue })
}

export { translateRiskReason }
