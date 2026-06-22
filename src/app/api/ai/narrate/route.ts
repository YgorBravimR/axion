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
 */
import { canUseAiAssistant } from "@/lib/ai-assistant/access"
import { runAgentTurn } from "@/lib/ai-assistant/agent-loop"

interface NarrateRequestBody {
	tradeId?: unknown
	userMessage?: unknown
	conversationId?: unknown
}

const isString = (v: unknown): v is string =>
	typeof v === "string" && v.length > 0

/** Build a single SSE frame. Each frame is `data: <json>\n\n`. */
const sseFrame = (payload: unknown): string =>
	`data: ${JSON.stringify(payload)}\n\n`

const POST = async (request: Request): Promise<Response> => {
	// Gate: fail-closed, identical 404 for every "no" path.
	const access = await canUseAiAssistant("trade_detail")
	if (!access.canUse) {
		return new Response(null, { status: 404 })
	}

	let body: NarrateRequestBody
	try {
		body = (await request.json()) as NarrateRequestBody
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
			status: 400,
			headers: { "content-type": "application/json" },
		})
	}

	if (!isString(body.tradeId) || !isString(body.userMessage)) {
		return new Response(
			JSON.stringify({
				error: "Missing required fields: tradeId, userMessage.",
			}),
			{
				status: 400,
				headers: { "content-type": "application/json" },
			}
		)
	}

	const conversationId = isString(body.conversationId)
		? body.conversationId
		: undefined

	const encoder = new TextEncoder()
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const event of runAgentTurn({
					tradeId: body.tradeId as string,
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
