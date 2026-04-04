/**
 * Unit tests for `src/lib/coaching/prompt-builder.ts`.
 *
 * `buildCoachingPrompt` is a pure function — no network, no DB, no mocking.
 * Tests verify the structure, content, and data preservation of the returned
 * prompt object across: valid stats, null stats, empty insights, and various
 * topAssets configurations.
 *
 * `SYSTEM_PROMPT` is verified to contain the coaching persona keywords that
 * define the product's brand voice — these are load-bearing for downstream
 * LLM prompting quality.
 */

import { describe, it, expect } from "vitest"
import { buildCoachingPrompt, SYSTEM_PROMPT } from "@/lib/coaching/prompt-builder"
import { createOverallStats } from "./trade-coaching-factory"
import type { BuildPromptInput, CoachingPrompt } from "@/lib/coaching/prompt-builder"
import type { CoachingInsight } from "@/lib/coaching/pattern-detector"

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Creates a minimal valid `BuildPromptInput` with sensible defaults.
 *
 * @param overrides - Optional field overrides
 */
const createBuildPromptInput = (overrides: Partial<BuildPromptInput> = {}): BuildPromptInput => ({
	stats: overrides.stats !== undefined ? overrides.stats : createOverallStats(),
	insights: overrides.insights ?? [],
	tradeCount: overrides.tradeCount ?? 100,
	periodDays: overrides.periodDays ?? 30,
	accountType: overrides.accountType ?? "Live",
	topAssets: overrides.topAssets ?? [],
})

/**
 * Creates a minimal valid `CoachingInsight` for prompt builder tests.
 * Uses a "fee-drag" insight as a representative example.
 */
const createMockInsight = (overrides: Partial<CoachingInsight> = {}): CoachingInsight => ({
	id: overrides.id ?? "fee-drag",
	category: overrides.category ?? "fees",
	severity: overrides.severity ?? "warning",
	titleKey: overrides.titleKey ?? "coaching.insights.feeDrag.title",
	descriptionKey: overrides.descriptionKey ?? "coaching.insights.feeDrag.description",
	params: overrides.params ?? { feePercent: 25.5, totalFees: 500 },
	confidence: overrides.confidence ?? 0.95,
})

// ============================================================================
// SYSTEM_PROMPT constant
// ============================================================================

describe("SYSTEM_PROMPT", () => {
	it("should be a non-empty string", () => {
		expect(typeof SYSTEM_PROMPT).toBe("string")
		expect(SYSTEM_PROMPT.length).toBeGreaterThan(0)
	})

	it("should contain trading coach persona keywords", () => {
		const lowerPrompt = SYSTEM_PROMPT.toLowerCase()
		// These keywords define the coaching persona required by the product spec
		expect(lowerPrompt).toContain("trading")
		expect(lowerPrompt).toContain("coach")
		expect(lowerPrompt).toContain("data")
	})

	it("should mention actionable advice as a role expectation", () => {
		const lowerPrompt = SYSTEM_PROMPT.toLowerCase()
		expect(lowerPrompt).toContain("actionable")
	})

	it("should specify the expected response format guidance", () => {
		// The system prompt instructs the LLM to focus on top findings
		expect(SYSTEM_PROMPT).toContain("3")
	})
})

// ============================================================================
// buildCoachingPrompt — return structure
// ============================================================================

describe("buildCoachingPrompt — return structure", () => {
	it("should return an object with all three required fields", () => {
		const input = createBuildPromptInput()
		const result: CoachingPrompt = buildCoachingPrompt(input)

		expect(result).toHaveProperty("systemPrompt")
		expect(result).toHaveProperty("userPrompt")
		expect(result).toHaveProperty("dataContext")
	})

	it("should return non-empty strings for systemPrompt and userPrompt", () => {
		const input = createBuildPromptInput()
		const result = buildCoachingPrompt(input)

		expect(typeof result.systemPrompt).toBe("string")
		expect(result.systemPrompt.length).toBeGreaterThan(0)
		expect(typeof result.userPrompt).toBe("string")
		expect(result.userPrompt.length).toBeGreaterThan(0)
	})

	it("should return the exported SYSTEM_PROMPT constant as the systemPrompt field", () => {
		const result = buildCoachingPrompt(createBuildPromptInput())
		expect(result.systemPrompt).toBe(SYSTEM_PROMPT)
	})

	it("should return a dataContext object with all required sub-fields", () => {
		const input = createBuildPromptInput()
		const result = buildCoachingPrompt(input)

		expect(result.dataContext).toHaveProperty("stats")
		expect(result.dataContext).toHaveProperty("insights")
		expect(result.dataContext).toHaveProperty("tradeCount")
		expect(result.dataContext).toHaveProperty("periodDays")
		expect(result.dataContext).toHaveProperty("accountType")
		expect(result.dataContext).toHaveProperty("topAssets")
	})
})

// ============================================================================
// buildCoachingPrompt — userPrompt content
// ============================================================================

describe("buildCoachingPrompt — userPrompt content", () => {
	it("should include the periodDays value in the user prompt", () => {
		const input = createBuildPromptInput({ periodDays: 90 })
		const result = buildCoachingPrompt(input)

		expect(result.userPrompt).toContain("90")
	})

	it("should include the tradeCount value in the user prompt", () => {
		const input = createBuildPromptInput({ tradeCount: 247 })
		const result = buildCoachingPrompt(input)

		expect(result.userPrompt).toContain("247")
	})

	it("should include a Performance Summary section header", () => {
		const result = buildCoachingPrompt(createBuildPromptInput())
		expect(result.userPrompt).toContain("Performance Summary")
	})

	it("should include a Detected Patterns section header", () => {
		const result = buildCoachingPrompt(createBuildPromptInput())
		expect(result.userPrompt).toContain("Detected Patterns")
	})

	it("should include a question asking for top areas of improvement", () => {
		const result = buildCoachingPrompt(createBuildPromptInput())
		expect(result.userPrompt.toLowerCase()).toContain("top 3")
	})
})

// ============================================================================
// buildCoachingPrompt — data summary (stats present)
// ============================================================================

describe("buildCoachingPrompt — data summary with valid stats", () => {
	it("should include the account type in the data summary", () => {
		const input = createBuildPromptInput({ accountType: "Sim" })
		const result = buildCoachingPrompt(input)

		expect(result.userPrompt).toContain("Sim")
	})

	it("should include win rate from stats in the data summary", () => {
		const stats = createOverallStats({ winRate: 62.5 })
		const result = buildCoachingPrompt(createBuildPromptInput({ stats }))

		expect(result.userPrompt).toContain("62.5")
	})

	it("should include profit factor from stats in the data summary", () => {
		const stats = createOverallStats({ profitFactor: 2.15 })
		const result = buildCoachingPrompt(createBuildPromptInput({ stats }))

		expect(result.userPrompt).toContain("2.15")
	})

	it("should include average R from stats in the data summary with sign prefix", () => {
		const stats = createOverallStats({ averageR: 0.75 })
		const result = buildCoachingPrompt(createBuildPromptInput({ stats }))

		// Positive R should have a "+" prefix
		expect(result.userPrompt).toContain("+0.75R")
	})

	it("should include negative average R without double-negative sign", () => {
		const stats = createOverallStats({ averageR: -0.25 })
		const result = buildCoachingPrompt(createBuildPromptInput({ stats }))

		expect(result.userPrompt).toContain("-0.25R")
		expect(result.userPrompt).not.toContain("+-0.25R")
	})

	it("should include gross P&L from stats in the data summary", () => {
		const stats = createOverallStats({ grossPnl: 3750.5 })
		const result = buildCoachingPrompt(createBuildPromptInput({ stats }))

		expect(result.userPrompt).toContain("3750.50")
	})
})

// ============================================================================
// buildCoachingPrompt — null stats handling
// ============================================================================

describe("buildCoachingPrompt — null stats", () => {
	it("should not throw when stats is null", () => {
		const input = createBuildPromptInput({ stats: null })
		expect(() => buildCoachingPrompt(input)).not.toThrow()
	})

	it("should include a 'no statistics available' message when stats is null", () => {
		const input = createBuildPromptInput({ stats: null })
		const result = buildCoachingPrompt(input)

		expect(result.userPrompt.toLowerCase()).toContain("no statistics available")
	})

	it("should still include period days and trade count even when stats is null", () => {
		const input = createBuildPromptInput({ stats: null, periodDays: 45, tradeCount: 60 })
		const result = buildCoachingPrompt(input)

		expect(result.userPrompt).toContain("45")
		expect(result.userPrompt).toContain("60")
	})

	it("should preserve null as the stats field in dataContext", () => {
		const input = createBuildPromptInput({ stats: null })
		const result = buildCoachingPrompt(input)

		expect(result.dataContext.stats).toBeNull()
	})
})

// ============================================================================
// buildCoachingPrompt — insights summary
// ============================================================================

describe("buildCoachingPrompt — insights summary", () => {
	it("should include a 'no significant patterns' message when insights array is empty", () => {
		const input = createBuildPromptInput({ insights: [] })
		const result = buildCoachingPrompt(input)

		expect(result.userPrompt.toLowerCase()).toContain("no significant patterns")
	})

	it("should include the insight id in the user prompt when insights are present", () => {
		const insight = createMockInsight({ id: "fee-drag" })
		const input = createBuildPromptInput({ insights: [insight] })
		const result = buildCoachingPrompt(input)

		expect(result.userPrompt).toContain("fee-drag")
	})

	it("should label 'warning' severity insights with [WARNING] prefix", () => {
		const insight = createMockInsight({ severity: "warning" })
		const result = buildCoachingPrompt(createBuildPromptInput({ insights: [insight] }))

		expect(result.userPrompt).toContain("[WARNING]")
	})

	it("should label 'attention' severity insights with [ATTENTION] prefix", () => {
		const insight = createMockInsight({ severity: "attention" })
		const result = buildCoachingPrompt(createBuildPromptInput({ insights: [insight] }))

		expect(result.userPrompt).toContain("[ATTENTION]")
	})

	it("should label 'info' severity insights with [INFO] prefix", () => {
		const insight = createMockInsight({ severity: "info" })
		const result = buildCoachingPrompt(createBuildPromptInput({ insights: [insight] }))

		expect(result.userPrompt).toContain("[INFO]")
	})

	it("should include the confidence percentage in the insight summary", () => {
		// confidence = 0.95 → "95%"
		const insight = createMockInsight({ confidence: 0.95 })
		const result = buildCoachingPrompt(createBuildPromptInput({ insights: [insight] }))

		expect(result.userPrompt).toContain("95%")
	})

	it("should include insight params as key-value pairs", () => {
		const insight = createMockInsight({
			params: { feePercent: 25.5, totalFees: 500 },
		})
		const result = buildCoachingPrompt(createBuildPromptInput({ insights: [insight] }))

		expect(result.userPrompt).toContain("feePercent")
		expect(result.userPrompt).toContain("totalFees")
	})

	it("should number insights sequentially starting from 1", () => {
		const insights = [
			createMockInsight({ id: "fee-drag" }),
			createMockInsight({ id: "strategy-gap" }),
		]
		const result = buildCoachingPrompt(createBuildPromptInput({ insights }))

		expect(result.userPrompt).toContain("1.")
		expect(result.userPrompt).toContain("2.")
	})

	it("should include all provided insights in the output", () => {
		const insights = [
			createMockInsight({ id: "fee-drag" }),
			createMockInsight({ id: "strategy-gap" }),
			createMockInsight({ id: "overtrading" }),
		]
		const result = buildCoachingPrompt(createBuildPromptInput({ insights }))

		expect(result.userPrompt).toContain("fee-drag")
		expect(result.userPrompt).toContain("strategy-gap")
		expect(result.userPrompt).toContain("overtrading")
	})
})

// ============================================================================
// buildCoachingPrompt — topAssets handling
// ============================================================================

describe("buildCoachingPrompt — topAssets", () => {
	it("should include asset names when topAssets is non-empty", () => {
		const input = createBuildPromptInput({
			topAssets: [
				{ asset: "WINFUT", tradeCount: 50, winRate: 60 },
				{ asset: "DOLFUT", tradeCount: 30, winRate: 45 },
			],
		})
		const result = buildCoachingPrompt(input)

		expect(result.userPrompt).toContain("WINFUT")
		expect(result.userPrompt).toContain("DOLFUT")
	})

	it("should include trade counts and win rates for each asset", () => {
		const input = createBuildPromptInput({
			topAssets: [{ asset: "WINFUT", tradeCount: 50, winRate: 63 }],
		})
		const result = buildCoachingPrompt(input)

		expect(result.userPrompt).toContain("50")
		expect(result.userPrompt).toContain("63")
	})

	it("should not include a top assets line when topAssets is empty", () => {
		const input = createBuildPromptInput({ topAssets: [] })
		const result = buildCoachingPrompt(input)

		expect(result.userPrompt).not.toContain("Top assets")
	})
})

// ============================================================================
// buildCoachingPrompt — dataContext preservation
// ============================================================================

describe("buildCoachingPrompt — dataContext field preservation", () => {
	it("should preserve all input fields verbatim in dataContext", () => {
		const stats = createOverallStats({ winRate: 55 })
		const insights = [createMockInsight()]
		const topAssets = [{ asset: "WINFUT", tradeCount: 80, winRate: 58 }]

		const input: BuildPromptInput = {
			stats,
			insights,
			tradeCount: 150,
			periodDays: 60,
			accountType: "Live",
			topAssets,
		}

		const result = buildCoachingPrompt(input)

		expect(result.dataContext.stats).toBe(stats)
		expect(result.dataContext.insights).toBe(insights)
		expect(result.dataContext.tradeCount).toBe(150)
		expect(result.dataContext.periodDays).toBe(60)
		expect(result.dataContext.accountType).toBe("Live")
		expect(result.dataContext.topAssets).toBe(topAssets)
	})

	it("should preserve an empty insights array in dataContext without mutation", () => {
		const emptyInsights: CoachingInsight[] = []
		const result = buildCoachingPrompt(createBuildPromptInput({ insights: emptyInsights }))
		expect(result.dataContext.insights).toBe(emptyInsights)
		expect(result.dataContext.insights).toHaveLength(0)
	})

	it("should preserve the exact tradeCount and periodDays numbers in dataContext", () => {
		const input = createBuildPromptInput({ tradeCount: 999, periodDays: 365 })
		const result = buildCoachingPrompt(input)

		expect(result.dataContext.tradeCount).toBe(999)
		expect(result.dataContext.periodDays).toBe(365)
	})

	it("should preserve the accountType string exactly in dataContext", () => {
		const input = createBuildPromptInput({ accountType: "Funded" })
		const result = buildCoachingPrompt(input)

		expect(result.dataContext.accountType).toBe("Funded")
	})
})
