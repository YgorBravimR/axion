/**
 * POST /api/ai/narrate — AI Assistant streaming endpoint (SSE).
 *
 * Wire format: text/event-stream. Each event is one JSON object on a single
 * `data:` line, terminated by a blank line. The client (NarratorPanel) feeds
 * events into its render loop. See agent-loop.ts for the event taxonomy.
 *
 * Gate-closed responses MUST return 404 (not 403, not 401) — 403 leaks that
 * the feature exists. The fail-closed gate is the first line of the
 * isolation model; a wrong status code here punches a hole in it.
 *
 * Request body shape (forwards-compatible):
 *   - { surface, contextRefId, userMessage, conversationId? } — generic form
 *   - { tradeId, userMessage, conversationId? }                — legacy alias
 *     for surface=trade_detail. Kept so the existing trade-detail client
 *     does not have to ship in the same PR.
 */
import { canUseAiAssistant } from "@/lib/ai-assistant/access"
import {
	runAgentTurn,
	isAssistantSurface,
	type AssistantSurface,
} from "@/lib/ai-assistant/agent-loop"

interface NarrateRequestBody {
	surface?: unknown
	contextRefId?: unknown
	tradeId?: unknown
	userMessage?: unknown
	conversationId?: unknown
}

const isString = (v: unknown): v is string =>
	typeof v === "string" && v.length > 0

/** Build a single SSE frame. Each frame is `data: <json>\n\n`. */
const sseFrame = (payload: unknown): string =>
	`data: ${JSON.stringify(payload)}\n\n`

/** Build a JSON error response. */
const errorResponse = (error: string, status: number = 400): Response =>
	new Response(JSON.stringify({ error }), {
		status,
		headers: { "content-type": "application/json" },
	})

const POST = async (request: Request): Promise<Response> => {
	let body: NarrateRequestBody
	try {
		body = (await request.json()) as NarrateRequestBody
	} catch {
		return errorResponse("Invalid JSON body.")
	}

	// Resolve surface + contextRefId. Legacy `tradeId` aliases to trade_detail.
	let surface: AssistantSurface
	let contextRefId: string
	if (isString(body.surface) && isAssistantSurface(body.surface)) {
		surface = body.surface
		if (!isString(body.contextRefId)) {
			return errorResponse("Missing required field: contextRefId.")
		}
		contextRefId = body.contextRefId
	} else if (isString(body.tradeId)) {
		surface = "trade_detail"
		contextRefId = body.tradeId
	} else {
		return errorResponse(
			"Missing required fields: surface+contextRefId or tradeId."
		)
	}

	if (!isString(body.userMessage)) {
		return errorResponse("Missing required field: userMessage.")
	}

	// Gate: fail-closed, identical 404 for every "no" path. Surface-aware.
	const access = await canUseAiAssistant(surface)
	if (!access.canUse) {
		return new Response(null, { status: 404 })
	}

	const conversationId = isString(body.conversationId)
		? body.conversationId
		: undefined

	const encoder = new TextEncoder()
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const event of runAgentTurn({
					surface,
					contextRefId,
					userMessage: body.userMessage as string,
					conversationId,
				})) {
					controller.enqueue(encoder.encode(sseFrame(event)))
				}
			} catch (e) {
				const message = e instanceof Error ? e.message : "Unknown error."
				controller.enqueue(
					encoder.encode(
						sseFrame({
							type: "error",
							code: "AGENT_LOOP_FAILED",
							message,
						})
					)
				)
			} finally {
				controller.close()
			}
		},
	})

	return new Response(stream, {
		status: 200,
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache, no-transform",
			"connection": "keep-alive",
			"x-accel-buffering": "no",
		},
	})
}

export { POST }
