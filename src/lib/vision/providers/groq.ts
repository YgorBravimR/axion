/**
 * Groq Vision Provider (Llama Vision - FREE)
 *
 * Available models (as of 2026):
 * - llama-3.2-11b-vision-preview (smaller, faster)
 * - llama-3.2-90b-vision-preview (larger, deprecated)
 * - llava-v1.5-7b-4096-preview (alternative)
 */

import Groq from "groq-sdk"
import type { VisionExtractionRequest, VisionExtractionResponse } from "../types"

// Current vision model - update if deprecated
const GROQ_VISION_MODEL = "llama-3.2-11b-vision-preview"

export const isGroqAvailable = (): boolean => {
	return !!process.env.GROQ_API_KEY
}

export const extractWithGroq = async (
	request: VisionExtractionRequest
): Promise<VisionExtractionResponse> => {
	const apiKey = process.env.GROQ_API_KEY
	if (!apiKey) {
		throw new Error("GROQ_API_KEY not configured")
	}

	const client = new Groq({ apiKey })

	const response = await client.chat.completions.create({
		model: GROQ_VISION_MODEL,
		max_tokens: 4096,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: request.prompt,
					},
					{
						type: "image_url",
						image_url: {
							url: `data:${request.mimeType};base64,${request.imageBase64}`,
						},
					},
				],
			},
		],
	})

	const content = response.choices[0]?.message?.content ?? ""

	return {
		provider: "groq",
		content,
		confidence: 85,
		usage: {
			promptTokens: response.usage?.prompt_tokens,
			completionTokens: response.usage?.completion_tokens,
			totalTokens: response.usage?.total_tokens,
		},
	}
}
