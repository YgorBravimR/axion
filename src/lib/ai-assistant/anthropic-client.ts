/**
 * AI Assistant — thin Anthropic SDK wrapper.
 *
 * Mirrors the pattern from `src/lib/vision/providers/claude.ts`. Two
 * additions:
 *   - Prompt caching on the system prompt + tool schemas (large stable
 *     prefix → cache hits after warmup → ~10× cost reduction on warm
 *     turns per the spec §6 cost model).
 *   - Returns the raw `MessageStream` for the route handler to forward via
 *     SSE. The agent loop wraps this; nothing else should construct
 *     `Anthropic` directly.
 *
 * Model selection is hard-coded to Sonnet 4.6 for Phase 1. Haiku fallback
 * + Opus dev mode land in Phase 2.
 */
import Anthropic from "@anthropic-ai/sdk"
import type {
	MessageParam,
	ToolUnion,
} from "@anthropic-ai/sdk/resources/messages"

const MODEL_ID = "claude-sonnet-4-6"
const MAX_TOKENS = 1024

interface AssistantMessageParams {
	systemPrompt: string
	tools: ToolUnion[]
	messages: MessageParam[]
}

/** Build the Anthropic client. Throws when the env key is missing — the
 * visibility gate should prevent us reaching this in that case, so we
 * surface it loudly if anything bypassed the gate. */
const buildClient = (): Anthropic => {
	const apiKey = process.env.ANTHROPIC_API_KEY
	if (!apiKey) {
		throw new Error(
			"ANTHROPIC_API_KEY missing — visibility gate should have prevented this call"
		)
	}
	return new Anthropic({ apiKey })
}

/**
 * Single non-streaming turn. The agent loop uses this and handles tool-use
 * iterations on its own. We don't stream from the SDK directly today —
 * the route handler streams pre-validated chunks to the client AFTER the
 * full response is in hand (Phase 1 validator runs post-stream; see
 * `validators.ts`). Streaming-during-validation lands in Phase 2.
 */
const createMessage = async ({
	systemPrompt,
	tools,
	messages,
}: AssistantMessageParams) => {
	const client = buildClient()
	return await client.messages.create({
		model: MODEL_ID,
		max_tokens: MAX_TOKENS,
		system: [
			{
				type: "text",
				text: systemPrompt,
				// Cache the system prompt. TTL ~5min on the prefix-cache,
				// shared across all users (the prompt has no user-specific
				// data — see isolation spec §B.4).
				cache_control: { type: "ephemeral" },
			},
		],
		tools,
		messages,
	})
}

export { createMessage, MODEL_ID }
export type { AssistantMessageParams }
