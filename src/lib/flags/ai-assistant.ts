/**
 * Build-time env check for AI Assistant. Runtime resolution is in
 * `src/lib/ai-assistant/access.ts`. See `docs/plans/ai-assistant-phase-1.md`
 * §2a for the full visibility gating model.
 */
const isAiAssistantBuildEnabled = (): boolean => {
	if (!process.env.ANTHROPIC_API_KEY) {
		return false
	}
	return process.env.AI_ASSISTANT_ENABLED === "1"
}

export { isAiAssistantBuildEnabled }
