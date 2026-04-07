/**
 * Claude (Anthropic) Vision Provider
 */

import Anthropic from "@anthropic-ai/sdk"
import type { VisionExtractionRequest, VisionExtractionResponse } from "../types"

export const isClaudeAvailable = (): boolean => {
	return !!process.env.ANTHROPIC_API_KEY
}

export const extractWithClaude = async (
	request: VisionExtractionRequest
): Promise<VisionExtractionResponse> => {
	const apiKey = process.env.ANTHROPIC_API_KEY
	if (!apiKey) {
		throw new Error("ANTHROPIC_API_KEY not configured")
	}

	const client = new Anthropic({ apiKey })

	// Map mime type to Anthropic's expected format
	const mediaType = request.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp"

	const response = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 4096,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "image",
						source: {
							type: "base64",
							media_type: mediaType,
							data: request.imageBase64,
						},
					},
					{
						type: "text",
						text: request.prompt,
					},
				],
			},
		],
	})

	const content = response.content[0]?.type === "text" ? response.content[0].text : ""

	return {
		provider: "claude",
		content,
		confidence: 95,
		usage: {
			promptTokens: response.usage.input_tokens,
			completionTokens: response.usage.output_tokens,
			totalTokens: response.usage.input_tokens + response.usage.output_tokens,
		},
	}
}
