/**
 * OpenAI GPT-4 Vision OCR Provider
 *
 * Uses GPT-4 Vision to extract structured trade data directly from ProfitChart screenshots.
 * Much more accurate than traditional OCR for dark-themed UIs and handles context intelligently.
 */

import OpenAI from "openai"
import type { OcrParseResult, ParsedTrade, ProfitChartSummary, ProfitChartExecution } from "./types"
import { normalizeB3Asset } from "./profitchart-parser"

// ==========================================
// Types
// ==========================================

interface ExtractedTrade {
	asset: string
	openingTime: string
	closingTime: string | null
	avgBuyPrice: number | null
	avgSellPrice: number | null
	executions: Array<{
		time: string
		quantity: number
		price: number
		type: "entry" | "exit"
	}>
}

interface VisionExtractionResult {
	trades: ExtractedTrade[]
	rawText: string
	confidence: number
}

// ==========================================
// OpenAI Client
// ==========================================

const getOpenAIClient = (): OpenAI | null => {
	const apiKey = process.env.OPENAI_API_KEY
	if (!apiKey) {
		return null
	}
	return new OpenAI({ apiKey })
}

/**
 * Check if OpenAI Vision is available (API key configured)
 */
export const isOpenAIVisionAvailable = (): boolean => {
	const hasKey = !!process.env.OPENAI_API_KEY
	return hasKey
}

// ==========================================
// Vision Extraction
// ==========================================

const EXTRACTION_PROMPT = `You are extracting trade data from a ProfitChart screenshot (Brazilian trading platform).

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
 * Extract trade data from image using GPT-4 Vision
 */
export const extractWithVision = async (
	imageBase64: string,
	mimeType: string = "image/png"
): Promise<VisionExtractionResult> => {
	const client = getOpenAIClient()

	if (!client) {
		throw new Error("OpenAI API key not configured. Add OPENAI_API_KEY to your .env file.")
	}

	const response = await client.chat.completions.create({
		model: "gpt-4o",
		max_tokens: 4096,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: EXTRACTION_PROMPT,
					},
					{
						type: "image_url",
						image_url: {
							url: `data:${mimeType};base64,${imageBase64}`,
							detail: "high",
						},
					},
				],
			},
		],
	})

	const content = response.choices[0]?.message?.content
	if (!content) {
		throw new Error("No response from OpenAI Vision")
	}

	// Parse JSON response
	const jsonMatch = content.match(/\{[\s\S]*\}/)
	if (!jsonMatch) {
		throw new Error("Could not parse JSON from Vision response")
	}

	const parsed = JSON.parse(jsonMatch[0]) as VisionExtractionResult
	return parsed
}

/**
 * Convert Vision extraction result to OcrParseResult format
 */
export const visionResultToParseResult = (
	visionResult: VisionExtractionResult
): OcrParseResult => {
	const trades: ParsedTrade[] = visionResult.trades.map((trade, index) => {
		const assetInfo = normalizeB3Asset(trade.asset)

		const summary: ProfitChartSummary = {
			asset: assetInfo.normalizedSymbol,
			originalContractCode: assetInfo.originalCode,
			openingTime: trade.openingTime,
			closingTime: trade.closingTime,
			totalQuantity: trade.executions.reduce((sum, e) => sum + e.quantity, 0),
			avgBuyPrice: trade.avgBuyPrice,
			avgSellPrice: trade.avgSellPrice,
			direction: null,
		}

		// Determine direction from executions
		const entries = trade.executions.filter((e) => e.type === "entry")
		if (entries.length > 0) {
			summary.direction = "long"
		} else {
			summary.direction = "short"
		}

		const executions: ProfitChartExecution[] = trade.executions.map((e, i) => ({
			time: e.time,
			quantity: e.quantity,
			price: e.price,
			type: e.type,
			rowIndex: i + 1,
		}))

		return {
			id: `trade-vision-${index}`,
			summary,
			executions,
		}
	})

	// For backwards compatibility
	const firstTrade = trades[0]

	return {
		success: trades.length > 0,
		summary: firstTrade?.summary ?? null,
		executions: firstTrade?.executions ?? [],
		trades,
		rawText: visionResult.rawText,
		confidence: visionResult.confidence * 100, // Convert to percentage
		columnDetection: {
			columns: [],
			missingRequired: [],
			hasAllRequired: true, // Vision doesn't need column detection
		},
		errors: [],
		warnings: [],
	}
}

/**
 * Main function: Extract and parse trade data from image using GPT-4 Vision
 */
export const recognizeWithVision = async (
	imageBase64: string,
	mimeType: string = "image/png"
): Promise<OcrParseResult> => {
	const visionResult = await extractWithVision(imageBase64, mimeType)
	return visionResultToParseResult(visionResult)
}
