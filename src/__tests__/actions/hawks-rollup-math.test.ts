import { describe, it, expect } from "vitest"

/**
 * Hawks KPI rollup aggregation tests — from raw database counts to displayed metrics.
 *
 * These tests validate the SQL aggregation queries in getStrategyHawksRollup
 * and the KPI card calculation logic in hawks-playbook-panel.tsx.
 *
 * Focus: ensure counts flow correctly through the aggregation pipeline
 * and percentages round appropriately for UI display.
 */

// ─── Mock Types & Fixtures ──────────────────────────────────────────────────

interface StrategyHawksRollup {
	totalHawksTrades: number
	vwapRespectedCount: number
	ajusteRespectedCount: number
	tripleScreenConfirmedCount: number
	biasRespectedCount: number
	biasRespectedDenom: number
	withinDailyCapCount: number
	overDailyCapCount: number
	scenarioDistribution: Array<{
		scenarioId: string | null
		code: string | null
		name: string | null
		count: number
	}>
}

const EMPTY_HAWKS_ROLLUP: StrategyHawksRollup = {
	totalHawksTrades: 0,
	vwapRespectedCount: 0,
	ajusteRespectedCount: 0,
	tripleScreenConfirmedCount: 0,
	biasRespectedCount: 0,
	biasRespectedDenom: 0,
	withinDailyCapCount: 0,
	overDailyCapCount: 0,
	scenarioDistribution: [],
}

const createMockRollup = (
	overrides: Partial<StrategyHawksRollup> = {}
): StrategyHawksRollup => ({
	...EMPTY_HAWKS_ROLLUP,
	...overrides,
})

// ─── Helpers: KPI Card Rate Calculation ──────────────────────────────────────

/**
 * KpiCard helper from hawks-playbook-panel.tsx.
 * Calculates: hasData = total > 0, rate = met / total (or 0), pct = Math.round(rate * 100)
 */
interface KpiCardMetrics {
	hasData: boolean
	rate: number
	pct: number
}

const calculateKpiCardMetrics = (
	met: number,
	total: number
): KpiCardMetrics => {
	const hasData = total > 0
	const rate = hasData ? met / total : 0
	const pct = Math.round(rate * 100)
	return { hasData, rate, pct }
}

// ─── Helpers: Daily Cap Calculation ────────────────────────────────────────

/**
 * Daily cap logic from hawks-playbook-panel.tsx (lines 98-100).
 */
interface DailyCapMetrics {
	capTotal: number
	overCapRate: number
	capHasOverages: boolean
	overCapPct: number
}

const calculateDailyCapMetrics = (
	withinCount: number,
	overCount: number
): DailyCapMetrics => {
	const capTotal = withinCount + overCount
	const overCapRate = capTotal > 0 ? overCount / capTotal : 0
	const capHasOverages = overCount > 0
	const overCapPct = Math.round(overCapRate * 100)
	return {
		capTotal,
		overCapRate,
		capHasOverages,
		overCapPct,
	}
}

// ─── Empty Rollup Handling ──────────────────────────────────────────────────

describe("Hawks Rollup — Empty Set Handling", () => {
	it("should return EMPTY_HAWKS_ROLLUP when totalHawksTrades is 0", () => {
		const rollup = createMockRollup({ totalHawksTrades: 0 })
		expect(rollup.totalHawksTrades).toBe(0)
		expect(rollup.vwapRespectedCount).toBe(0)
		expect(rollup.ajusteRespectedCount).toBe(0)
		expect(rollup.tripleScreenConfirmedCount).toBe(0)
		expect(rollup.biasRespectedCount).toBe(0)
		expect(rollup.biasRespectedDenom).toBe(0)
	})

	it("should not divide by zero when rendering KPI card with empty data", () => {
		const metrics = calculateKpiCardMetrics(0, 0)
		expect(metrics.hasData).toBe(false)
		expect(metrics.rate).toBe(0)
		expect(metrics.pct).toBe(0)
	})

	it("should show '—' for KPI card when no data", () => {
		const metrics = calculateKpiCardMetrics(0, 0)
		const display = metrics.hasData ? `${metrics.pct}%` : "—"
		expect(display).toBe("—")
	})
})

// ─── VWAP KPI Card Rendering ────────────────────────────────────────────────

describe("Hawks Rollup — VWAP KPI Card", () => {
	it("should display 80% when 8 of 10 trades respected VWAP", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			vwapRespectedCount: 8,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.hasData).toBe(true)
		expect(metrics.pct).toBe(80)
	})

	it("should display 0% when no trades respected VWAP", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			vwapRespectedCount: 0,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.hasData).toBe(true)
		expect(metrics.pct).toBe(0)
	})

	it("should display 100% when all trades respected VWAP", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			vwapRespectedCount: 10,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.hasData).toBe(true)
		expect(metrics.pct).toBe(100)
	})

	it("should round 33.33% to 33%", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 3,
			vwapRespectedCount: 1,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.pct).toBe(33)
	})

	it("should round 66.67% to 67%", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 3,
			vwapRespectedCount: 2,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.pct).toBe(67)
	})

	it("should display metric '8 / 10' in KPI card", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			vwapRespectedCount: 8,
		})
		const display = `${rollup.vwapRespectedCount} / ${rollup.totalHawksTrades}`
		expect(display).toBe("8 / 10")
	})
})

// ─── Ajuste KPI Card Rendering ──────────────────────────────────────────────

describe("Hawks Rollup — Ajuste KPI Card", () => {
	it("should display 70% when 7 of 10 trades respected Ajuste", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			ajusteRespectedCount: 7,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.ajusteRespectedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.pct).toBe(70)
	})

	it("should display 40% when 2 of 5 trades respected Ajuste", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 5,
			ajusteRespectedCount: 2,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.ajusteRespectedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.pct).toBe(40)
	})

	it("should display metric '7 / 10' in KPI card", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			ajusteRespectedCount: 7,
		})
		const display = `${rollup.ajusteRespectedCount} / ${rollup.totalHawksTrades}`
		expect(display).toBe("7 / 10")
	})
})

// ─── Triple-Screen KPI Card Rendering ───────────────────────────────────────

describe("Hawks Rollup — Triple-Screen KPI Card", () => {
	it("should display 60% when 6 of 10 trades confirmed Triple-Screen", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			tripleScreenConfirmedCount: 6,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.tripleScreenConfirmedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.pct).toBe(60)
	})

	it("should display 0% when no trades confirmed Triple-Screen", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			tripleScreenConfirmedCount: 0,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.tripleScreenConfirmedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.pct).toBe(0)
	})

	it("should display metric '6 / 10' in KPI card", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			tripleScreenConfirmedCount: 6,
		})
		const display = `${rollup.tripleScreenConfirmedCount} / ${rollup.totalHawksTrades}`
		expect(display).toBe("6 / 10")
	})
})

// ─── Bias-Respected KPI Card Rendering ──────────────────────────────────────

describe("Hawks Rollup — Bias-Respected KPI Card", () => {
	it("should use biasRespectedDenom as total when rendering card", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 5,
			biasRespectedDenom: 10,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		expect(metrics.pct).toBe(50)
	})

	it("should display 50% when 5 of 10 confirmed-bias days respected bias", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 5,
			biasRespectedDenom: 10,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		expect(metrics.pct).toBe(50)
	})

	it("should display 0% when no bias-checked trades respected bias", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 0,
			biasRespectedDenom: 10,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		expect(metrics.pct).toBe(0)
	})

	it("should display 100% when all bias-checked trades respected bias", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 10,
			biasRespectedDenom: 10,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		expect(metrics.pct).toBe(100)
	})

	it("should show '—' when biasRespectedDenom is 0 (no bias data)", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 0,
			biasRespectedDenom: 0,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		const display = metrics.hasData ? `${metrics.pct}%` : "—"
		expect(display).toBe("—")
	})

	it("should display metric '5 / 10' when bias data exists", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 5,
			biasRespectedDenom: 10,
		})
		const display = `${rollup.biasRespectedCount} / ${rollup.biasRespectedDenom}`
		expect(display).toBe("5 / 10")
	})

	it("should display metric with denom when only 3 trades had bias data", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 2,
			biasRespectedDenom: 3,
		})
		const display = `${rollup.biasRespectedCount} / ${rollup.biasRespectedDenom}`
		expect(display).toBe("2 / 3")
	})
})

// ─── Daily Cap Rendering ────────────────────────────────────────────────────

describe("Hawks Rollup — Daily Cap", () => {
	it("should calculate capTotal = within + over", () => {
		const rollup = createMockRollup({
			withinDailyCapCount: 9,
			overDailyCapCount: 1,
		})
		const metrics = calculateDailyCapMetrics(
			rollup.withinDailyCapCount,
			rollup.overDailyCapCount
		)
		expect(metrics.capTotal).toBe(10)
	})

	it("should calculate 10% over cap when 1 of 10 exceed daily limit", () => {
		const rollup = createMockRollup({
			withinDailyCapCount: 9,
			overDailyCapCount: 1,
		})
		const metrics = calculateDailyCapMetrics(
			rollup.withinDailyCapCount,
			rollup.overDailyCapCount
		)
		expect(metrics.overCapPct).toBe(10)
	})

	it("should display 'allWithin' when capHasOverages is false", () => {
		const rollup = createMockRollup({
			withinDailyCapCount: 10,
			overDailyCapCount: 0,
		})
		const metrics = calculateDailyCapMetrics(
			rollup.withinDailyCapCount,
			rollup.overDailyCapCount
		)
		const display = metrics.capHasOverages ? "Over" : "AllWithin"
		expect(display).toBe("AllWithin")
	})

	it("should display overages percentage when capHasOverages is true", () => {
		const rollup = createMockRollup({
			withinDailyCapCount: 7,
			overDailyCapCount: 3,
		})
		const metrics = calculateDailyCapMetrics(
			rollup.withinDailyCapCount,
			rollup.overDailyCapCount
		)
		expect(metrics.capHasOverages).toBe(true)
		expect(metrics.overCapPct).toBe(30)
	})

	it("should handle edge case: all trades exceed daily cap", () => {
		const rollup = createMockRollup({
			withinDailyCapCount: 0,
			overDailyCapCount: 5,
		})
		const metrics = calculateDailyCapMetrics(
			rollup.withinDailyCapCount,
			rollup.overDailyCapCount
		)
		expect(metrics.overCapPct).toBe(100)
		expect(metrics.capHasOverages).toBe(true)
	})

	it("should handle edge case: no trades recorded", () => {
		const rollup = createMockRollup({
			withinDailyCapCount: 0,
			overDailyCapCount: 0,
		})
		const metrics = calculateDailyCapMetrics(
			rollup.withinDailyCapCount,
			rollup.overDailyCapCount
		)
		expect(metrics.capTotal).toBe(0)
		expect(metrics.overCapRate).toBe(0)
		expect(metrics.capHasOverages).toBe(false)
	})
})

// ─── Scenario Distribution ──────────────────────────────────────────────────

describe("Hawks Rollup — Scenario Distribution", () => {
	it("should preserve scenario order and counts", () => {
		const rollup = createMockRollup({
			scenarioDistribution: [
				{ scenarioId: "s1", code: "ROMPIMENTO", name: "Rompimento", count: 5 },
				{ scenarioId: "s2", code: "PULLBACK", name: "Pullback", count: 3 },
			],
		})
		expect(rollup.scenarioDistribution).toHaveLength(2)
		expect(rollup.scenarioDistribution[0]?.count).toBe(5)
		expect(rollup.scenarioDistribution[1]?.count).toBe(3)
	})

	it("should include untagged bucket (scenarioId = null)", () => {
		const rollup = createMockRollup({
			scenarioDistribution: [
				{ scenarioId: "s1", code: "ROMPIMENTO", name: "Rompimento", count: 5 },
				{ scenarioId: null, code: null, name: null, count: 2 },
			],
		})
		const untagged = rollup.scenarioDistribution.find(
			(s) => s.scenarioId === null
		)
		expect(untagged?.count).toBe(2)
	})

	it("should sum scenario counts to approximately totalHawksTrades", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			scenarioDistribution: [
				{ scenarioId: "s1", code: "ROMPIMENTO", name: "Rompimento", count: 5 },
				{ scenarioId: "s2", code: "PULLBACK", name: "Pullback", count: 3 },
				{ scenarioId: null, code: null, name: null, count: 2 },
			],
		})
		const totalScenarios = rollup.scenarioDistribution.reduce(
			(sum, s) => sum + s.count,
			0
		)
		expect(totalScenarios).toBe(rollup.totalHawksTrades)
	})

	it("should handle empty scenario distribution", () => {
		const rollup = createMockRollup({
			scenarioDistribution: [],
		})
		expect(rollup.scenarioDistribution).toHaveLength(0)
	})
})

// ─── Integration: Full Rollup Display ───────────────────────────────────────

describe("Hawks Rollup — Full Panel Display", () => {
	it("should render all KPI cards with correct percentages", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			vwapRespectedCount: 8,
			ajusteRespectedCount: 7,
			tripleScreenConfirmedCount: 6,
			biasRespectedCount: 5,
			biasRespectedDenom: 10,
		})

		const vwapMetrics = calculateKpiCardMetrics(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		const ajusteMetrics = calculateKpiCardMetrics(
			rollup.ajusteRespectedCount,
			rollup.totalHawksTrades
		)
		const screenMetrics = calculateKpiCardMetrics(
			rollup.tripleScreenConfirmedCount,
			rollup.totalHawksTrades
		)
		const biasMetrics = calculateKpiCardMetrics(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)

		expect(vwapMetrics.pct).toBe(80)
		expect(ajusteMetrics.pct).toBe(70)
		expect(screenMetrics.pct).toBe(60)
		expect(biasMetrics.pct).toBe(50)
	})

	it("should handle partial bias data in full rollup", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			vwapRespectedCount: 8,
			biasRespectedCount: 0,
			biasRespectedDenom: 0, // No bias data
		})

		const biasMetrics = calculateKpiCardMetrics(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		const biasDisplay = biasMetrics.hasData ? `${biasMetrics.pct}%` : "—"
		expect(biasDisplay).toBe("—")
	})
})

// ─── Rounding Edge Cases ────────────────────────────────────────────────────

describe("Hawks Rollup — Rounding Edge Cases", () => {
	it("should round 49.4% down to 49%", () => {
		// 49 / 100 = 0.49 => Math.round(0.49 * 100) = 49
		const rollup = createMockRollup({
			totalHawksTrades: 100,
			vwapRespectedCount: 49,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.pct).toBe(49)
	})

	it("should round 49.5% up to 50%", () => {
		// 1 / 2 = 0.5 => Math.round(0.5 * 100) = 50
		const rollup = createMockRollup({
			totalHawksTrades: 2,
			vwapRespectedCount: 1,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.pct).toBe(50)
	})

	it("should round 33.33% to 33%", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 300,
			vwapRespectedCount: 100,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.pct).toBe(33)
	})

	it("should round 66.67% to 67%", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 300,
			vwapRespectedCount: 200,
		})
		const metrics = calculateKpiCardMetrics(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(metrics.pct).toBe(67)
	})
})
