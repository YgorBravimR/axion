/**
 * AI Assistant — post-stream validators.
 *
 * Three rules, run AFTER the LLM produces its final response, BEFORE
 * persisting the message + sending the SSE `done` event. Each validator
 * returns its verdict (caught snippets + count) for the audit log.
 *
 * Phase 1 behavior: log violations + sanitize the most egregious cases.
 * Hard-blocking comes later once we have a baseline false-positive rate
 * from dogfood (see plan §6).
 *
 * Rule semantics:
 *   1. unsourced-number — every numeric token in the response must appear
 *      somewhere in the serialized tool-call results. Catches hallucinated
 *      stats / fake R-multiples / made-up win rates.
 *   2. recommendation-phrase — sentences proposing parameter changes are
 *      caught and replaced with a redaction marker. Phase 1 narrator does
 *      not recommend; the model still tries sometimes.
 *   3. off-topic — response that doesn't reference any tool result at all
 *      is likely off-topic or a refusal. Flagged for audit.
 */

interface ValidatorVerdicts {
	unsourcedNumbers: string[]
	recommendationsCaught: string[]
	offTopicFlag: boolean
}

interface ValidatorResult {
	sanitizedText: string
	verdicts: ValidatorVerdicts
}

/** Extract numeric tokens. Matches integers and decimals, with optional
 * trailing %, R, pts, $, R$. Returns the bare numeric portion. */
const NUMBER_TOKEN_RE = /-?\d+(?:[.,]\d+)?/g

/** Recommendation-phrase patterns. Conservative on purpose — false positives
 * are cheap (one paragraph redacted), false negatives are expensive (a
 * recommendation slips into production). Tune as eval cases catch real
 * slips. */
const RECOMMENDATION_PATTERNS: RegExp[] = [
	/\b(?:you|users?)\s+should\b/i,
	/\bi\s+recommend\b/i,
	/\bi\s+suggest\b/i,
	/\b(?:try|consider)\s+(?:tightening|widening|raising|lowering|moving|changing|expanding|narrowing)\b/i,
	/\b(?:tighten|widen|raise|lower|move|change)\s+(?:your|the)\s+(?:stop|target|tier|playbook|ladder|threshold|sizing|risk|brake|shield)\b/i,
]

/** Strings that the agent emits with no underlying number it could verify.
 * Skip the unsourced check for these. */
const NUMERIC_NOISE = new Set([
	"0",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"10",
	"100",
	"1.0",
])

/**
 * Build a haystack from the tool-call payloads so we can ask "did this
 * number ever appear in any tool result?". JSON-serializing every payload
 * is a coarse but reliable check.
 */
const buildToolResultHaystack = (toolResults: unknown[]): string =>
	toolResults
		.map((r) => {
			try {
				return JSON.stringify(r)
			} catch {
				return String(r)
			}
		})
		.join(" ")

/** Catch numbers in the response that don't appear in any tool result.
 * Returns the offending number strings (deduped). */
const findUnsourcedNumbers = (
	response: string,
	toolResults: unknown[]
): string[] => {
	const haystack = buildToolResultHaystack(toolResults)
	const found = new Set<string>()
	for (const match of response.matchAll(NUMBER_TOKEN_RE)) {
		const token = match[0]
		if (NUMERIC_NOISE.has(token)) {
			continue
		}
		// Normalize comma decimals for the haystack check.
		const norm = token.replace(",", ".")
		if (haystack.includes(token) || haystack.includes(norm)) {
			continue
		}
		found.add(token)
	}
	return Array.from(found)
}

/** Catch recommendation phrases. Returns the snippets that matched. */
const findRecommendationPhrases = (response: string): string[] => {
	const caught = new Set<string>()
	for (const pattern of RECOMMENDATION_PATTERNS) {
		const m = response.match(pattern)
		if (m) {
			caught.add(m[0])
		}
	}
	return Array.from(caught)
}

/** Off-topic = response doesn't reference any tool by name AND doesn't use
 * the explicit refusal templates. Catches "I think you should..." style
 * drift that the recommendation regex missed. */
const isOffTopic = (response: string, toolNames: string[]): boolean => {
	const lower = response.toLowerCase()
	const refusalMarkers = ["i only narrate", "i narrate what the engine"]
	const mentionsTool = toolNames.some((n) =>
		lower.includes(n.replace(/_/g, " ").toLowerCase())
	)
	const mentionsEngineConcept =
		lower.includes("engine") ||
		lower.includes("tier") ||
		lower.includes("booster") ||
		lower.includes("trade") ||
		lower.includes("snapshot")
	const isRefusal = refusalMarkers.some((m) => lower.includes(m))
	return !mentionsTool && !mentionsEngineConcept && !isRefusal
}

/** Replace caught recommendation sentences with a redaction marker. Keeps
 * the surrounding narration intact. */
const sanitizeRecommendations = (
	response: string,
	caught: string[]
): string => {
	if (caught.length === 0) {
		return response
	}
	let out = response
	// Redact the SENTENCE containing each match, not just the match text.
	for (const phrase of caught) {
		const sentenceRe = new RegExp(
			`[^.!?]*${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.!?]*[.!?]`,
			"i"
		)
		out = out.replace(
			sentenceRe,
			" [redacted: recommendation phrasing — Phase 1 narrator does not propose changes.]"
		)
	}
	return out.trim()
}

const runValidators = (
	response: string,
	toolResults: unknown[],
	toolNames: string[]
): ValidatorResult => {
	const recommendationsCaught = findRecommendationPhrases(response)
	const sanitized = sanitizeRecommendations(response, recommendationsCaught)
	const unsourcedNumbers = findUnsourcedNumbers(sanitized, toolResults)
	const offTopicFlag = isOffTopic(sanitized, toolNames)

	return {
		sanitizedText: sanitized,
		verdicts: {
			unsourcedNumbers,
			recommendationsCaught,
			offTopicFlag,
		},
	}
}

export {
	runValidators,
	findUnsourcedNumbers,
	findRecommendationPhrases,
	isOffTopic,
	sanitizeRecommendations,
}
export type { ValidatorResult, ValidatorVerdicts }
