import type { RadarChartData } from "@/types"

/**
 * Axion Score — composite 0–100 metric tuned for Brazilian futures day-traders
 * (mini-índice WIN, mini-dólar WDO).
 *
 * Weights informed by:
 *   • Brazilian metrics literature (Euroinvest, QuantBrasil, devtrader,
 *     Sharks Investment) which universally rates Fator de Lucro and Drawdown
 *     as the top two grading axes.
 *   • Mesa proprietária gate criteria (Apex, LVL Trading) — daily/max drawdown
 *     and consistency are non-negotiable for funded-account aspirants.
 *   • Hawks coaching philosophy — Disciplina (followed-plan %) is real signal
 *     Tradezella's Zella Score does not have. Keeping it differentiates Axion.
 *
 * The composite is a weighted average of each axis's pre-normalized (0–100)
 * score. Weights sum to 1.0.
 */
const AXION_SCORE_WEIGHTS: Record<string, number> = {
	profitFactor: 0.25,
	drawdown: 0.2,
	avgR: 0.2,
	discipline: 0.15,
	winRate: 0.1,
	consistency: 0.1,
}

type AxionScoreTier = "elite" | "forte" | "solido" | "building" | "attention"

interface AxionScore {
	score: number
	tier: AxionScoreTier
}

/**
 * Tier cutoffs informed by Brazilian Profit Factor thresholds:
 *   85–100 Elite   (PF ≥ 2.0, DD ≤ 10%, Disc ≥ 95)
 *   70–84  Forte   (PF 1.5–2.0, DD ≤ 15%)
 *   55–69  Sólido  (PF 1.2–1.5 — viable but tight)
 *   40–54  Em Construção (PF 1.0–1.2 — breakeven zone)
 *    0–39  Atenção (PF < 1.0 — losing system)
 */
const scoreToTier = (score: number): AxionScoreTier => {
	if (score >= 85) {
		return "elite"
	}
	if (score >= 70) {
		return "forte"
	}
	if (score >= 55) {
		return "solido"
	}
	if (score >= 40) {
		return "building"
	}
	return "attention"
}

/**
 * Compose the Axion Score from radar axes. Empty/missing axes default to 0
 * contribution (the weight is still applied, so an unscored trader hits 0).
 */
const computeAxionScore = (radar: RadarChartData[]): AxionScore => {
	if (radar.length === 0) {
		return { score: 0, tier: "attention" }
	}
	let score = 0
	for (const axis of radar) {
		const weight = AXION_SCORE_WEIGHTS[axis.metricKey] ?? 0
		score += axis.normalized * weight
	}
	const clamped = Math.max(0, Math.min(100, score))
	return { score: clamped, tier: scoreToTier(clamped) }
}

export {
	computeAxionScore,
	scoreToTier,
	AXION_SCORE_WEIGHTS,
	type AxionScore,
	type AxionScoreTier,
}
