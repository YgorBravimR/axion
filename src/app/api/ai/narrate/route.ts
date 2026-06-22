/**
 * POST /api/ai/narrate — AI Assistant streaming endpoint.
 *
 * STUB: this route exists today only to prove the visibility gate end-to-end.
 * The actual SSE/Anthropic streaming logic ships in Phase 1 PR 3 (see
 * `docs/plans/ai-assistant-phase-1.md` §8 PR 3).
 *
 * Behavior today:
 *   - Gate closed (any reason: build env off, DB config off, role not in
 *     allowlist, etc.) → 404. Indistinguishable from "this route doesn't
 *     exist". This is intentional: the assistant is invisible at the
 *     network layer to users who shouldn't see it, the same way it's
 *     invisible at the DOM layer.
 *   - Gate open → 501 Not Implemented (until PR 3 fills in the loop).
 *
 * Never returns 403 — 403 leaks that the feature exists.
 */
import { NextResponse } from "next/server"
import { canUseAiAssistant } from "@/lib/ai-assistant/access"

export const POST = async (): Promise<Response> => {
	const access = await canUseAiAssistant()
	if (!access.canUse) {
		return new NextResponse(null, { status: 404 })
	}
	// Gate open. Real implementation lands in Phase 1 PR 3.
	return new NextResponse(null, { status: 501 })
}
