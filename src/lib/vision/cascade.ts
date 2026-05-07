/**
 * Vision Provider Cascade Handler
 *
 * Tries vision providers in order of preference until one succeeds:
 * OpenAI → Google Cloud Vision → Claude → Groq → Tesseract
 *
 * Usage:
 *   const result = await extractWithCascade(request, TRADE_EXTRACTION_PROMPT)
 */

import type {
	VisionProviderType,
	VisionExtractionRequest,
	VisionExtractionResponse,
	TradeExtractionResult,
	ExtractedTradeData,
} from "./types"

import { isOpenAIAvailable, extractWithOpenAI } from "./providers/openai"
import { isGoogleVisionAvailable, extractWithGoogle } from "./providers/google"
import { isClaudeAvailable, extractWithClaude } from "./providers/claude"
import { isGroqAvailable, extractWithGroq } from "./providers/groq"

// ==========================================
// Provider Configuration (Priority Order)
// ==========================================

interface ProviderConfig {
	type: VisionProviderType
	name: string
	isAvailable: () => boolean
	extract: (
		request: VisionExtractionRequest
	) => Promise<VisionExtractionResponse>
	supportsStructuredOutput: boolean
}

const PROVIDERS: ProviderConfig[] = [
	{
		type: "openai",
		name: "OpenAI GPT-4o",
		isAvailable: isOpenAIAvailable,
		extract: extractWithOpenAI,
		supportsStructuredOutput: true,
	},
	{
		type: "google",
		name: "Google Cloud Vision",
		isAvailable: isGoogleVisionAvailable,
		extract: extractWithGoogle,
		supportsStructuredOutput: false, // Returns raw text, needs parsing
	},
	{
		type: "claude",
		name: "Claude 3.5 Sonnet",
		isAvailable: isClaudeAvailable,
		extract: extractWithClaude,
		supportsStructuredOutput: true,
	},
	{
		type: "groq",
		name: "Groq Llama Vision (FREE)",
		isAvailable: isGroqAvailable,
		extract: extractWithGroq,
		supportsStructuredOutput: true,
	},
]

// ==========================================
// Availability Check
// ==========================================

export interface ProviderStatus {
	type: VisionProviderType
	name: string
	available: boolean
	envVar: string
}

/**
 * Get status of all vision providers
 */
export const getProvidersStatus = (): ProviderStatus[] => {
	return [
		{
			type: "openai",
			name: "OpenAI GPT-4o",
			available: isOpenAIAvailable(),
			envVar: "OPENAI_API_KEY",
		},
		{
			type: "google",
			name: "Google Cloud Vision",
			available: isGoogleVisionAvailable(),
			envVar: "GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_VISION_API_KEY",
		},
		{
			type: "claude",
			name: "Claude 3.5 Sonnet",
			available: isClaudeAvailable(),
			envVar: "ANTHROPIC_API_KEY",
		},
		{
			type: "groq",
			name: "Groq Llama Vision",
			available: isGroqAvailable(),
			envVar: "GROQ_API_KEY",
		},
		{
			type: "tesseract",
			name: "Tesseract.js (Fallback)",
			available: true, // Always available
			envVar: "None required",
		},
	]
}

/**
 * Get the first available provider
 */
export const getFirstAvailableProvider = (): ProviderConfig | null => {
	for (const provider of PROVIDERS) {
		if (provider.isAvailable()) {
			return provider
		}
	}
	return null
}

/**
 * Check if any AI vision provider is available (excluding Tesseract)
 */
export const hasAIVisionProvider = (): boolean => {
	return PROVIDERS.some((p) => p.isAvailable())
}

// ==========================================
// Cascade Extraction
// ==========================================

export interface CascadeResult {
	success: boolean
	provider: VisionProviderType
	response?: VisionExtractionResponse
	error?: string
	triedProviders: VisionProviderType[]
}

/**
 * Extract using cascade - tries providers in order until one succeeds
 */
export const extractWithCascade = async (
	request: VisionExtractionRequest
): Promise<CascadeResult> => {
	const triedProviders: VisionProviderType[] = []

	for (const provider of PROVIDERS) {
		if (!provider.isAvailable()) {
			continue
		}

		triedProviders.push(provider.type)

		try {
			// eslint-disable-next-line no-await-in-loop -- cascade providers must be tried sequentially; next provider is only attempted on failure of the current one
			const response = await provider.extract(request)

			return {
				success: true,
				provider: provider.type,
				response,
				triedProviders,
			}
		} catch (error) {
			console.error(`[VISION:Cascade] ❌ ${provider.name} failed:`, error)
			// Continue to next provider
		}
	}

	// All providers failed
	return {
		success: false,
		provider: "tesseract",
		error: "All AI vision providers failed",
		triedProviders,
	}
}

// ==========================================
// Trade Extraction (ProfitChart specific)
// ==========================================

export const TRADE_EXTRACTION_PROMPT = `You are extracting trade data from a ProfitChart screenshot (Brazilian trading platform).

IMPORTANT: Extract ALL trades visible in the image. Each trade has:
1. A summary row with: asset code (like WING25, WDOH26), opening time, closing time, buy price, sell price
2. Multiple execution rows below it with: time, quantity, price

Rules:
- Asset codes are B3 futures contracts (e.g., WING25 = Mini Index March 2025)
- Times are in HH:MM:SS format (Brazilian timezone)
- Prices are in Brazilian format (e.g., 185.875 means 185875 points for index futures)
- Quantities are typically 1-20 contracts per execution
- If a row has TWO times, it's a summary row (opening and closing times)
- If a row has ONE time, it's an execution row

For each execution, determine if it's an "entry" or "exit":
- Compare the execution price to the summary's avgBuyPrice and avgSellPrice
- If closer to buyPrice → "entry"
- If closer to sellPrice → "exit"

Respond ONLY with valid JSON in this exact format:
{
  "trades": [
    {
      "asset": "WING25",
      "openingTime": "09:48:01",
      "closingTime": "09:50:51",
      "avgBuyPrice": 185.875,
      "avgSellPrice": 185.964,
      "executions": [
        {"time": "09:48:01", "quantity": 10, "price": 185.875, "type": "entry"},
        {"time": "09:48:03", "quantity": 4, "price": 185.925, "type": "exit"}
      ]
    }
  ],
  "rawText": "Brief description of what you see in the image",
  "confidence": 0.95
}

Extract ALL trades you can see. Do not skip any.`

/**
 * Extract trades from ProfitChart screenshot using cascade
 */
export const extractTradesWithCascade = async (
	imageBase64: string,
	mimeType: string
): Promise<TradeExtractionResult> => {
	const request: VisionExtractionRequest = {
		imageBase64,
		mimeType,
		prompt: TRADE_EXTRACTION_PROMPT,
	}

	const result = await extractWithCascade(request)

	if (!result.success || !result.response) {
		// Return empty result for Tesseract fallback
		return {
			provider: "tesseract",
			trades: [],
			rawText: "",
			confidence: 0,
		}
	}

	// Google Vision returns raw text (not JSON) - needs special handling
	if (result.provider === "google") {
		// Return raw text - the server action will parse it with the OCR parser
		return {
			provider: "google",
			trades: [], // Empty - will be parsed on server
			rawText: result.response.content,
			confidence: result.response.confidence,
		}
	}

	// Parse JSON response from AI providers (OpenAI, Claude, Groq)
	try {
		const content = result.response.content
		const jsonMatch = content.match(/\{[\s\S]*\}/)

		if (!jsonMatch) {
			console.error(
				"[VISION:Cascade] No JSON found in response, content:",
				content.substring(0, 500)
			)
			throw new Error("No JSON found in response")
		}

		const parsed = JSON.parse(jsonMatch[0]) as {
			trades: ExtractedTradeData[]
			rawText: string
			confidence: number
		}

		return {
			provider: result.provider,
			trades: parsed.trades,
			rawText: parsed.rawText,
			confidence: parsed.confidence * 100,
		}
	} catch (error) {
		console.error("[VISION:Cascade] Failed to parse response:", error)
		console.error(
			"[VISION:Cascade] Raw content:",
			result.response.content.substring(0, 500)
		)

		// Return raw text for parsing
		return {
			provider: result.provider,
			trades: [],
			rawText: result.response.content,
			confidence: result.response.confidence,
		}
	}
}
