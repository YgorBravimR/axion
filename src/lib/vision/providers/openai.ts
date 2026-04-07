/**
 * OpenAI Vision Provider (GPT-4o)
 */

import OpenAI from "openai"
import type { VisionExtractionRequest, VisionExtractionResponse } from "../types"

export const isOpenAIAvailable = (): boolean => {
	return !!process.env.OPENAI_API_KEY
}

export const extractWithOpenAI = async (
	request: VisionExtractionRequest
): Promise<VisionExtractionResponse> => {
	const apiKey = process.env.OPENAI_API_KEY
	if (!apiKey) {
		throw new Error("OPENAI_API_KEY not configured")
	}

	const client = new OpenAI({ apiKey })
	const response = await client.chat.completions.create({
		model: "gpt-4o",
		max_tokens: 4096,
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: request.prompt },
					{
						type: "image_url",
						image_url: {
							url: `data:${request.mimeType};base64,${request.imageBase64}`,
							detail: "high",
						},
					},
				],
			},
		],
	})

	const content = response.choices[0]?.message?.content ?? ""

	return {
		provider: "openai",
		content,
		confidence: 95,
		usage: {
			promptTokens: response.usage?.prompt_tokens,
			completionTokens: response.usage?.completion_tokens,
			totalTokens: response.usage?.total_tokens,
		},
	}
}
