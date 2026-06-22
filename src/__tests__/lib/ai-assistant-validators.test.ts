/**
 * Tests for the post-stream validators.
 *
 * Validators are the agent's seatbelt. False negatives (a violation slips
 * through) are far more costly than false positives (a clean response
 * gets a sentence redacted). The tests bias accordingly.
 */
import { describe, it, expect } from "vitest"
import {
	findUnsourcedNumbers,
	findRecommendationPhrases,
	isOffTopic,
	sanitizeRecommendations,
	runValidators,
} from "@/lib/ai-assistant/validators"

describe("findUnsourcedNumbers", () => {
	it("returns empty when every number traces to a tool result", () => {
		const response = "The engine scored this AAA with 5 of 5 boosters fired."
		const toolResults = [{ tier: "AAA", boostersFired: 5, boostersTotal: 5 }]
		expect(findUnsourcedNumbers(response, toolResults)).toEqual([])
	})

	it("catches a number that does not appear in any tool payload", () => {
		const response = "Your win rate is 73% on Tuesdays."
		const toolResults = [{ totalTrades: 42, wins: 28, winRate: 66.7 }]
		expect(findUnsourcedNumbers(response, toolResults)).toContain("73")
	})

	it("ignores trivial integers (0..10 and 100, 1.0)", () => {
		const response = "0 boosters fired across 1 trade."
		const toolResults: unknown[] = []
		expect(findUnsourcedNumbers(response, toolResults)).toEqual([])
	})

	it("normalizes comma decimals against dot-decimal payloads", () => {
		const response = "The R-multiple was 1,25."
		const toolResults = [{ realizedRMultiple: 1.25 }]
		expect(findUnsourcedNumbers(response, toolResults)).toEqual([])
	})

	it("dedupes repeated unsourced numbers", () => {
		const response = "47.3 was the peak; 47.3 is impressive."
		const toolResults: unknown[] = []
		expect(findUnsourcedNumbers(response, toolResults)).toEqual(["47.3"])
	})
})

describe("findRecommendationPhrases", () => {
	it("catches 'you should ...'", () => {
		// May also match additional patterns (e.g. 'tighten your stop') — that's
		// the validator being thorough, not a bug. Assert the must-haves only.
		const caught = findRecommendationPhrases("You should tighten your stop.")
		expect(caught).toContain("You should")
	})

	it("catches 'I recommend ...'", () => {
		expect(findRecommendationPhrases("I recommend a tighter SL.")).toEqual([
			"I recommend",
		])
	})

	it("catches 'try tightening the stop'", () => {
		expect(
			findRecommendationPhrases("You could try tightening the stop here.")
		).toEqual(["try tightening"])
	})

	it("catches 'tighten your stop' direct verb form", () => {
		expect(
			findRecommendationPhrases("Tighten your stop to capture more.")
		).toEqual(["Tighten your stop"])
	})

	it("does NOT catch descriptive past-tense narration", () => {
		expect(
			findRecommendationPhrases(
				"The engine's stop sat 30% tighter than your manual one."
			)
		).toEqual([])
	})

	it("does NOT catch 'the user should' (third-person — narration about the user, not a directive)", () => {
		// Conservative: only direct 'you should' / 'users should' triggers.
		expect(
			findRecommendationPhrases("On Tuesdays the user could win more.")
		).toEqual([])
	})
})

describe("sanitizeRecommendations", () => {
	it("redacts the FULL sentence containing the matched phrase", () => {
		const out = sanitizeRecommendations(
			"The engine scored this A. You should tighten your stop next time.",
			["You should"]
		)
		expect(out).not.toContain("tighten your stop")
		expect(out).toContain("[redacted")
		expect(out).toContain("The engine scored this A.")
	})

	it("is a no-op when nothing was caught", () => {
		const text = "The engine scored this A."
		expect(sanitizeRecommendations(text, [])).toBe(text)
	})
})

describe("isOffTopic", () => {
	it("recognizes engine-concept narration as on-topic", () => {
		expect(
			isOffTopic("The engine scored this trade AAA.", [
				"get_trade_with_enrichment",
			])
		).toBe(false)
	})

	it("recognizes the refusal template as on-topic", () => {
		expect(
			isOffTopic("I only narrate output from the Axion engine on your data.", [
				"get_trade_with_enrichment",
			])
		).toBe(false)
	})

	it("flags a response that mentions nothing engine-related", () => {
		expect(
			isOffTopic("The weather looks fine today. Have a great session.", [
				"get_trade_with_enrichment",
			])
		).toBe(true)
	})
})

describe("runValidators — integration", () => {
	it("happy path: clean narration, all verdicts empty", () => {
		const response =
			"From the enrichment snapshot for this trade: 2 of 5 boosters fired. The engine scored this A."
		const toolResults = [
			{
				found: true,
				trade: { id: "t-1" },
				boostersFired: 2,
				boostersTotal: 5,
				tier: "A",
			},
		]
		const result = runValidators(response, toolResults, [
			"get_trade_with_enrichment",
		])
		expect(result.verdicts.unsourcedNumbers).toEqual([])
		expect(result.verdicts.recommendationsCaught).toEqual([])
		expect(result.verdicts.offTopicFlag).toBe(false)
		expect(result.sanitizedText).toBe(response)
	})

	it("catches a recommendation, sanitizes the response, AND surfaces it in verdicts", () => {
		const response =
			"The engine scored this A. You should tighten the stop to capture the next move."
		const result = runValidators(
			response,
			[{ tier: "A" }],
			["get_trade_with_enrichment"]
		)
		expect(result.verdicts.recommendationsCaught.length).toBeGreaterThan(0)
		expect(result.sanitizedText).toContain("[redacted")
		expect(result.sanitizedText).not.toContain("tighten the stop")
	})

	it("flags unsourced numbers AFTER sanitization (so they're not double-flagged)", () => {
		const response =
			"Your tier-A trades won 88% of the time. You should add a filter."
		const result = runValidators(
			response,
			[{ tier: "A" }],
			["get_trade_with_enrichment"]
		)
		// "88" is unsourced regardless; "you should" gets redacted.
		expect(result.verdicts.recommendationsCaught.length).toBeGreaterThan(0)
		expect(result.verdicts.unsourcedNumbers).toContain("88")
	})
})
