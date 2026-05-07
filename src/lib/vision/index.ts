/**
 * Vision Provider Module
 *
 * Unified interface for AI vision providers with automatic cascade fallback.
 * Order: OpenAI → Google Cloud Vision → Claude → Groq → Tesseract
 *
 * Usage:
 *   import { extractTradesWithCascade, getProvidersStatus } from "@/lib/vision"
 */

// Types
export type * from "./types"

// Cascade Handler
export {
	extractWithCascade,
	extractTradesWithCascade,
	getProvidersStatus,
	getFirstAvailableProvider,
	hasAIVisionProvider,
	TRADE_EXTRACTION_PROMPT,
	type CascadeResult,
	type ProviderStatus,
} from "./cascade"

// Individual Providers (for direct use if needed)
export { isOpenAIAvailable, extractWithOpenAI } from "./providers/openai"
export { isGoogleVisionAvailable, extractWithGoogle } from "./providers/google"
export { isClaudeAvailable, extractWithClaude } from "./providers/claude"
export { isGroqAvailable, extractWithGroq } from "./providers/groq"
