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

type TranslateFn = (
	key: string,
	values?: Record<string, string | number>
) => string

/**
 * Translates a raw riskReason string using the provided `t` function
 * scoped to the "riskSimulation" namespace.
 *
 * @param t - useTranslations("riskSimulation") return value
 * @param raw - e.g. "riskSimulation.reasons.t1BaseRisk", "riskSimulation.reasons.gainReinvest|25", or "skipped_daily_target"
 */
const translateRiskReason = (
	t: TranslateFn,
	raw: string | null | undefined
): string => {
	if (!raw) {
		return "—"
	}

	// Raw status enum values (skipped trades) → resolve via table.statuses.*
	if (raw.startsWith("skipped_")) {
		return t(`table.statuses.${raw}`)
	}

	// Strip the "riskSimulation." prefix if present
	const stripped = raw.startsWith("riskSimulation.")
		? raw.slice("riskSimulation.".length)
		: raw

	// Split by pipe to extract base key and all params
	const segments = stripped.split("|")
	const baseKey = segments[0]!

	// No params — simple key
	if (segments.length === 1) {
		return t(baseKey)
	}

	// Build translated base, then append param-based suffixes
	let result = ""
	let baseParam: string | undefined

	// First param may be a plain value (e.g. "reasons.gainReinvest|25") or key:value (e.g. "ddTier:50")
	for (let i = 1; i < segments.length; i++) {
		const segment = segments[i]!
		const colonIndex = segment.indexOf(":")

		if (colonIndex === -1) {
			// Plain value param (legacy format: "reasons.gainReinvest|25")
			baseParam = segment
		} else {
			const paramKey = segment.slice(0, colonIndex)
			const paramVal = segment.slice(colonIndex + 1)

			if (paramKey === "ddTier") {
				// Translate base key first if not yet done
				if (!result) {
					result = baseParam
						? t(
								baseKey,
								baseKey.endsWith("Step")
									? { step: baseParam }
									: { percent: baseParam }
							)
						: t(baseKey)
				}
				result += t("reasons.ddTierSuffix", { percent: paramVal })
			}
		}
	}

	// If result was never set (no special params like ddTier), translate with plain param
	if (!result) {
		if (baseParam) {
			return t(
				baseKey,
				baseKey.endsWith("Step") ? { step: baseParam } : { percent: baseParam }
			)
		}
		return t(baseKey)
	}

	return result
}

export { translateRiskReason }
