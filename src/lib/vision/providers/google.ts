/**
 * Google Cloud Vision Provider
 *
 * Supports two authentication methods:
 * 1. Service Account: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 * 2. API Key: GOOGLE_CLOUD_VISION_API_KEY=AIza...
 *
 * Note: Google Vision is primarily for OCR/text detection.
 * For structured extraction, we use Vision API for text detection,
 * then rely on the parser for structured data.
 */

import { z } from "zod"
import type {
	VisionExtractionRequest,
	VisionExtractionResponse,
} from "../types"

// Zod schema for Google Vision API response shape
const GoogleVisionResponseSchema = z.object({
	responses: z
		.array(
			z.object({
				fullTextAnnotation: z
					.object({
						text: z.string(),
					})
					.optional(),
				textAnnotations: z
					.array(
						z.object({
							description: z.string(),
						})
					)
					.optional(),
			})
		)
		.optional(),
})

export const isGoogleVisionAvailable = (): boolean => {
	const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS
	const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY

	// Check if credentials looks like a file path (not an API key)
	const hasValidCredentials =
		credentials &&
		(credentials.endsWith(".json") || credentials.startsWith("/"))
	const hasApiKey = !!apiKey

	return hasValidCredentials || hasApiKey
}

/**
 * Call Google Vision API using REST (works with API Key)
 * Uses DOCUMENT_TEXT_DETECTION for better table/layout preservation
 */
const callGoogleVisionREST = async (imageBase64: string): Promise<string> => {
	const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY
	if (!apiKey) {
		throw new Error("GOOGLE_CLOUD_VISION_API_KEY not configured")
	}

	const response = await fetch(
		`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				requests: [
					{
						image: { content: imageBase64 },
						features: [
							{ type: "DOCUMENT_TEXT_DETECTION" }, // Better for tables
						],
					},
				],
			}),
		}
	)

	if (!response.ok) {
		const error = await response.text()
		console.error("[VISION:Google] API Error:", error)
		throw new Error(`Google Vision API error: ${response.status}`)
	}

	const rawData = await response.json()
	const data = GoogleVisionResponseSchema.parse(rawData)

	// Try to get structured text from fullTextAnnotation (preserves layout)
	const fullTextAnnotation = data.responses?.[0]?.fullTextAnnotation
	if (fullTextAnnotation?.text) {
		return fullTextAnnotation.text
	}

	// Fallback to textAnnotations
	const textAnnotations = data.responses?.[0]?.textAnnotations
	return textAnnotations?.[0]?.description ?? ""
}

/**
 * Call Google Vision API using SDK (works with Service Account)
 */
const callGoogleVisionSDK = async (imageBase64: string): Promise<string> => {
	// Dynamic import to avoid issues when credentials aren't set
	const vision = await import("@google-cloud/vision")
	const client = new vision.ImageAnnotatorClient()

	const imageBuffer = Buffer.from(imageBase64, "base64")

	const [result] = await client.textDetection({
		image: { content: imageBuffer },
	})

	const detections = result.textAnnotations
	return detections?.[0]?.description ?? ""
}

export const extractWithGoogle = async (
	request: VisionExtractionRequest
): Promise<VisionExtractionResponse> => {
	let fullText: string

	// Prefer API Key (simpler), fall back to Service Account
	if (process.env.GOOGLE_CLOUD_VISION_API_KEY) {
		fullText = await callGoogleVisionREST(request.imageBase64)
	} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
		fullText = await callGoogleVisionSDK(request.imageBase64)
	} else {
		throw new Error("No Google Vision credentials configured")
	}

	// Google Vision returns raw text, not structured JSON
	// The cascade handler will need to parse this with Tesseract parser
	return {
		provider: "google",
		content: fullText,
		confidence: 90,
	}
}
