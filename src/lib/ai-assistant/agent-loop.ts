/**
 * AI Assistant — agent loop.
 *
 * Single entry point for the SSE route handler:
 *   ```ts
 *   for await (const event of runAgentTurn({ tradeId, userMessage })) {
 *     sseSend(event)
 *   }
 *   ```
 *
 * What it does, in order:
 *   1. `canUseAiAssistant("trade_detail")` — visibility gate (fail-closed).
 *   2. `requireAuth()` — pull userId + accountId from the session.
 *   3. `assertWithinBudget(userId)` — cost ceiling guard.
 *   4. Resolve or create the `ai_assistant_conversations` row.
 *   5. Persist the user message.
 *   6. Tool-use loop, max ITER_CAP iterations:
 *        - Call Anthropic with system prompt + tool schemas + history.
 *        - For each `tool_use` block: dispatch via the registry, emit
 *          `tool_call` + `tool_result` events, feed the result back as a
 *          `tool_result` content block in the next iteration.
 *        - When the model returns `end_turn` with a text block: emit
 *          `token` (full text — Phase 1 doesn't stream within the turn)
 *          and exit the loop.
 *   7. Run validators on the assembled text.
 *   8. Persist the assistant message (sanitized text + tool trace + token
 *      counts + validator verdicts) and per-violation rows.
 *   9. `recordSpend()` — atomic UPSERT into the usage table.
 *  10. Emit `done` with messageId + totals.
 *
 * Errors anywhere mid-loop → emit `error` event + persist what we have so
 * the conversation row stays usable on retry.
 *
 * The loop returns an `AsyncGenerator` so the route handler can forward
 * each event over SSE without holding the full response in memory.
 */
import { eq } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { db } from "@/db/drizzle"
import {
	aiAssistantConversations,
	aiAssistantMessages,
	aiAssistantViolations,
} from "@/db/schema"
import { canUseAiAssistant } from "./access"
import { createMessage, MODEL_ID } from "./anthropic-client"
import { assertWithinBudget, recordSpend } from "./budget"
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./system-prompt"
import { dispatchTool, TOOL_SCHEMAS } from "./tool-registry"
import { runValidators, type ValidatorVerdicts } from "./validators"
import type {
	ContentBlock,
	MessageParam,
	ToolUnion,
} from "@anthropic-ai/sdk/resources/messages"

const ITER_CAP = 6

type AssistantSurface = "trade_detail" | "weekly_review"

const isAssistantSurface = (s: string): s is AssistantSurface =>
	s === "trade_detail" || s === "weekly_review"

/** Pricing (cents per 1M tokens) for Sonnet 4.6. Phase 1 ignores the cache-
 * hit discount in the recorded cost — overestimates spend slightly, errs on
 * the right side of the budget check. */
const SONNET_INPUT_CENTS_PER_M = 300
const SONNET_OUTPUT_CENTS_PER_M = 1500

interface AgentTurnInput {
	surface: AssistantSurface
	/** Opaque scope id. Shape depends on surface:
	 *   - "trade_detail": trade UUID
	 *   - "weekly_review": `${isoYear}-W${isoWeek}` (e.g. "2026-W25")
	 */
	contextRefId: string
	userMessage: string
	conversationId?: string
}

type AgentEvent =
	| { type: "tool_call"; name: string; args: Record<string, unknown> }
	| { type: "tool_result"; name: string; result: unknown }
	| { type: "token"; text: string }
	| {
			type: "done"
			messageId: string
			conversationId: string
			tokensIn: number
			tokensOut: number
			costCents: number
			verdicts: ValidatorVerdicts
	  }
	| { type: "error"; code: string; message: string }
	| {
			type: "budget_exceeded"
			capCents: number
			spentCents: number
	  }

const computeCostCents = (tokensIn: number, tokensOut: number): number => {
	const inCost = (tokensIn * SONNET_INPUT_CENTS_PER_M) / 1_000_000
	const outCost = (tokensOut * SONNET_OUTPUT_CENTS_PER_M) / 1_000_000
	return Math.ceil(inCost + outCost)
}

const anthropicTools = (): ToolUnion[] => TOOL_SCHEMAS as unknown as ToolUnion[]

const buildOpeningMessage = (
	surface: AssistantSurface,
	contextRefId: string,
	userMessage: string
): string => {
	if (surface === "weekly_review") {
		// contextRefId shape: "YYYY-Www" (e.g. "2026-W25"). Parse for clarity in
		// the opening so the model can call get_weekly_review_payload without
		// re-parsing.
		const match = /^(\d{4})-W(\d{1,2})$/.exec(contextRefId)
		const scope =
			match && match[1] && match[2]
				? `ISO year ${match[1]}, ISO week ${match[2]}`
				: contextRefId
		return `Surface: weekly_review. Week in scope: ${scope}.\n\nUser question: ${userMessage}`
	}
	return `Surface: trade_detail. Trade in scope: ${contextRefId}\n\nUser question: ${userMessage}`
}

const extractTextFromContent = (content: ContentBlock[]): string =>
	content
		.filter(
			(b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text"
		)
		.map((b) => b.text)
		.join("")

const extractToolUses = (content: ContentBlock[]) =>
	content.filter(
		(b): b is Extract<ContentBlock, { type: "tool_use" }> =>
			b.type === "tool_use"
	)

const runAgentTurn = async function* (
	input: AgentTurnInput
): AsyncGenerator<AgentEvent, void, unknown> {
	// Gate 1: visibility. Fail-closed; identical error code regardless of
	// reason so the user never learns which gate denied them.
	const access = await canUseAiAssistant(input.surface)
	if (!access.canUse) {
		yield {
			type: "error",
			code: "GATE_CLOSED",
			message: "AI Assistant is not available.",
		}
		return
	}

	// Gate 2: auth (gives us the active account).
	const { userId, accountId } = await requireAuth()

	// Gate 3: budget.
	const budget = await assertWithinBudget(userId)
	if (!budget.allowed) {
		yield {
			type: "budget_exceeded",
			capCents: budget.capCents,
			spentCents: budget.spentCents,
		}
		return
	}

	// Conversation row. Phase 1: one row per Ask invocation (no thread
	// resumption from the client yet).
	let conversationId = input.conversationId
	if (!conversationId) {
		const [row] = await db
			.insert(aiAssistantConversations)
			.values({
				userId,
				accountId,
				surface: input.surface,
				contextRefId: input.contextRefId,
				promptVersion: PROMPT_VERSION,
			})
			.returning({ id: aiAssistantConversations.id })
		if (!row) {
			yield {
				type: "error",
				code: "DB_ERROR",
				message: "Failed to create conversation.",
			}
			return
		}
		conversationId = row.id
	}

	// Persist the user message (Phase 1 stores user content untrimmed).
	await db.insert(aiAssistantMessages).values({
		conversationId,
		role: "user",
		content: input.userMessage,
	})

	// Build the initial message history.
	const history: MessageParam[] = [
		{
			role: "user",
			content: buildOpeningMessage(
				input.surface,
				input.contextRefId,
				input.userMessage
			),
		},
	]
	const toolTrace: Array<{
		name: string
		args: Record<string, unknown>
		result: unknown
		latencyMs: number
	}> = []
	let tokensIn = 0
	let tokensOut = 0
	let finalText = ""
	let exhausted = true

	for (let iter = 0; iter < ITER_CAP; iter += 1) {
		// The tool-use loop is inherently sequential: each iteration's prompt
		// depends on the previous turn's tool results.
		// eslint-disable-next-line no-await-in-loop
		const response = await createMessage({
			systemPrompt: SYSTEM_PROMPT,
			tools: anthropicTools(),
			messages: history,
		})
		tokensIn += response.usage.input_tokens
		tokensOut += response.usage.output_tokens

		const toolUses = extractToolUses(response.content)

		if (toolUses.length === 0 || response.stop_reason === "end_turn") {
			finalText = extractTextFromContent(response.content)
			exhausted = false
			break
		}

		// Add the assistant turn (with its tool_use blocks) into history,
		// then a single user turn containing the tool_result blocks.
		history.push({ role: "assistant", content: response.content })
		const toolResultBlocks = []
		for (const block of toolUses) {
			const args = (block.input ?? {}) as Record<string, unknown>
			yield { type: "tool_call", name: block.name, args }
			const t0 = performance.now()
			let result: unknown
			try {
				// Tools within a single iteration are dispatched serially so
				// later tools see the side effects of earlier ones if any
				// future tool ever has side effects. Today all tools are
				// read-only — but serial is the conservative default.
				// eslint-disable-next-line no-await-in-loop
				result = await dispatchTool(block.name, args)
			} catch (e) {
				result = {
					error: e instanceof Error ? e.message : String(e),
				}
			}
			const latencyMs = Math.round(performance.now() - t0)
			toolTrace.push({ name: block.name, args, result, latencyMs })
			yield { type: "tool_result", name: block.name, result }
			toolResultBlocks.push({
				type: "tool_result" as const,
				tool_use_id: block.id,
				content: JSON.stringify(result),
			})
		}
		history.push({ role: "user", content: toolResultBlocks })
	}

	if (exhausted) {
		finalText =
			"I ran out of iteration budget without producing a complete narration. Try a more focused question."
	}

	// Validators.
	const toolResults = toolTrace.map((t) => t.result)
	const toolNames = toolTrace.map((t) => t.name)
	const { sanitizedText, verdicts } = runValidators(
		finalText,
		toolResults,
		toolNames
	)
	yield { type: "token", text: sanitizedText }

	const costCents = computeCostCents(tokensIn, tokensOut)

	// Persist the assistant message + per-violation rows.
	const [assistantRow] = await db
		.insert(aiAssistantMessages)
		.values({
			conversationId,
			role: "assistant",
			content: sanitizedText,
			toolCalls: toolTrace,
			model: MODEL_ID,
			tokensIn,
			tokensOut,
			costCents,
			latencyMs: null,
			validatorVerdicts: verdicts,
		})
		.returning({ id: aiAssistantMessages.id })

	const messageId = assistantRow?.id ?? ""

	if (messageId) {
		const rows: Array<{ messageId: string; kind: string; snippet: string }> = []
		for (const n of verdicts.unsourcedNumbers) {
			rows.push({ messageId, kind: "unsourced_number", snippet: n })
		}
		for (const r of verdicts.recommendationsCaught) {
			rows.push({ messageId, kind: "recommendation_phrase", snippet: r })
		}
		if (verdicts.offTopicFlag) {
			rows.push({
				messageId,
				kind: "off_topic",
				snippet: sanitizedText.slice(0, 500),
			})
		}
		if (rows.length > 0) {
			await db.insert(aiAssistantViolations).values(rows)
		}
	}

	await recordSpend({
		userId,
		costCents,
		tokensIn,
		tokensOut,
	})

	// Optimistic close: mark the conversation closed after a successful
	// turn. Future turns reopen via a fresh row (no cross-turn threading
	// in Phase 1).
	await db
		.update(aiAssistantConversations)
		.set({ closedAt: new Date() })
		.where(eq(aiAssistantConversations.id, conversationId))

	yield {
		type: "done",
		messageId,
		conversationId,
		tokensIn,
		tokensOut,
		costCents,
		verdicts,
	}
}

export { runAgentTurn, computeCostCents, ITER_CAP, isAssistantSurface }
export type { AgentTurnInput, AgentEvent, AssistantSurface }
