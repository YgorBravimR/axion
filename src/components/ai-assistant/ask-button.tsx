/**
 * AI Assistant trigger button.
 *
 * STUB: this is the gate-only shell. The real "Ask about this trade" panel
 * (with streaming, audit trail, validators) ships in Phase 1 PR 4 (see
 * `docs/plans/ai-assistant-phase-1.md` §8 PR 4).
 *
 * Visibility contract (critical):
 *   - This is a React Server Component. The visibility check runs on the
 *     server. When the gate is closed, the component returns `null` — the
 *     button is not in the rendered HTML at all. No DOM nodes, no
 *     hydration, no script bundle increase for users who don't see it.
 *   - Mount this component anywhere a future surface might host the
 *     assistant; if the gate is closed, the surface stays pixel-identical
 *     to today.
 *
 * Use:
 *   ```tsx
 *   // In a server component for a trade-detail page:
 *   import { AskButton } from "@/components/ai-assistant/ask-button"
 *
 *   <AskButton surface="trade_detail" contextRefId={trade.id.toString()} />
 *   ```
 *
 * When the gate is open, today this renders a placeholder button that does
 * nothing (PR 4 wires the click handler + panel). The placeholder carries a
 * `data-testid` used by the gate's integration test to assert "visible when
 * enabled, absent when disabled".
 */
import { canUseAiAssistant } from "@/lib/ai-assistant/access"

interface AskButtonProps {
	/** Which surface is hosting the button. Matches `allowedSurfaces`
	 * entries in `ai_assistant_config`. */
	surface: string
	/** Opaque ID of the thing the assistant will narrate about (e.g.
	 * tradeId, dayKey, backtestRunId). Forwarded to the streaming endpoint
	 * in PR 4. */
	contextRefId: string
}

const AskButton = async ({
	surface,
	contextRefId,
}: AskButtonProps): Promise<React.ReactElement | null> => {
	const access = await canUseAiAssistant(surface)
	if (!access.canUse) {
		return null
	}

	// Placeholder. Real button + panel land in PR 4. The data-testid + data-
	// context-ref-id are how the gate integration test asserts presence.
	return (
		<button
			type="button"
			data-testid="ai-assistant-ask-button"
			data-surface={surface}
			data-context-ref-id={contextRefId}
			disabled
			className="text-tiny text-txt-300"
		>
			Ask about this
		</button>
	)
}

export { AskButton }
