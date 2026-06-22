/**
 * AI Assistant trigger button (server component).
 *
 * Visibility contract:
 *   - Server-rendered. When the gate is closed, returns `null` → no DOM, no
 *     hydration, no client bundle increase.
 *   - When the gate is open, renders the client-side AskButtonClient which
 *     owns panel open state + streams from `/api/ai/narrate`.
 *
 * Mount this anywhere a surface might host the assistant:
 *   ```tsx
 *   <AskButton surface="trade_detail" contextRefId={trade.id.toString()} />
 *   ```
 */
import { canUseAiAssistant } from "@/lib/ai-assistant/access"
import { AskButtonClient } from "./ask-button-client"

interface AskButtonProps {
	/** Which surface is hosting the button. Matches `allowedSurfaces`
	 * entries in `ai_assistant_config`. */
	surface: string
	/** Opaque ID of the thing the assistant will narrate about (e.g.
	 * tradeId, dayKey, backtestRunId). */
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

	return <AskButtonClient surface={surface} contextRefId={contextRefId} />
}

export { AskButton }
export type { AskButtonProps }
