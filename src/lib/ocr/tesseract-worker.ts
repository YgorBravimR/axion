/**
 * Tesseract.js Worker Wrapper
 *
 * Manages the OCR worker lifecycle with Portuguese language support
 * and progress callbacks for UI feedback.
 */

import Tesseract from "tesseract.js"
import type { OcrProgressInfo, OcrRawResult } from "./types"

type ProgressCallback = (_info: OcrProgressInfo) => void

/**
 * Map Tesseract status to translation keys.
 * The consuming component should translate these via useTranslations("ocr.progress").
 */
const getProgressMessage = (status: string): string => {
	const keyMap: Record<string, string> = {
		"loading": "ocr.progress.loading",
		"initializing": "ocr.progress.initializing",
		"loading tesseract core": "ocr.progress.loadingCore",
		"initializing tesseract": "ocr.progress.initializingOcr",
		"loading language traineddata": "ocr.progress.loadingLanguage",
		"initializing api": "ocr.progress.preparingRecognition",
		"recognizing": "ocr.progress.recognizing",
	}

	const key = status.toLowerCase()
	return keyMap[key] ?? status
}

/**
 * Map Tesseract status to our status enum
 */
const mapStatus = (tesseractStatus: string): OcrProgressInfo["status"] => {
	const status = tesseractStatus.toLowerCase()
	if (status.includes("loading")) {
		return "loading"
	}
	if (status.includes("initializing")) {
		return "initializing"
	}
	if (status.includes("recognizing")) {
		return "recognizing"
	}
	return "loading"
}

/**
 * Advanced image preprocessing for ProfitChart screenshots
 *
 * Applies multiple techniques optimized for dark-theme trading platforms:
 * 1. Upscale image (2x) for better character recognition
 * 2. Convert to grayscale
 * 3. Invert colors (dark → light background)
 * 4. Apply adaptive contrast enhancement
 * 5. Apply sharpening
 * 6. Binary thresholding for clean text
 */
export const preprocessImage = async (
	imageSource: string | File | Blob
): Promise<string> => {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.crossOrigin = "anonymous"

		img.onload = () => {
			// Upscale factor (2x improves OCR accuracy significantly)
			const scale = 2
			const canvas = document.createElement("canvas")
			const ctx = canvas.getContext("2d")

			if (!ctx) {
				reject(new Error("Failed to get canvas context"))
				return
			}

			canvas.width = img.width * scale
			canvas.height = img.height * scale

			// Use better image scaling
			ctx.imageSmoothingEnabled = true
			ctx.imageSmoothingQuality = "high"

			// Draw upscaled image
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

			// Get image data
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
			const data = imageData.data

			// Step 1: Calculate histogram and find optimal threshold
			const histogram = new Array(256).fill(0)
			const grayscaleValues: number[] = []

			for (let i = 0; i < data.length; i += 4) {
				// Weighted grayscale (better for text)
				const gray = Math.round(
					0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!
				)
				grayscaleValues.push(gray)
				histogram[gray]++
			}

			// Calculate average brightness
			const avgBrightness =
				grayscaleValues.reduce((a, b) => a + b, 0) / grayscaleValues.length
			const isDarkTheme = avgBrightness < 100

			// Otsu's method for optimal threshold
			const totalPixels = grayscaleValues.length
			let sumTotal = 0
			for (let i = 0; i < 256; i++) {
				sumTotal += i * histogram[i]
			}

			let sumBackground = 0
			let weightBackground = 0
			let maxVariance = 0
			let threshold = 128

			for (let t = 0; t < 256; t++) {
				weightBackground += histogram[t]
				if (weightBackground === 0) {
					continue
				}

				const weightForeground = totalPixels - weightBackground
				if (weightForeground === 0) {
					break
				}

				sumBackground += t * histogram[t]
				const meanBackground = sumBackground / weightBackground
				const meanForeground = (sumTotal - sumBackground) / weightForeground

				const variance =
					weightBackground *
					weightForeground *
					Math.pow(meanBackground - meanForeground, 2)
				if (variance > maxVariance) {
					maxVariance = variance
					threshold = t
				}
			}

			// Step 2: Process each pixel
			for (let i = 0; i < data.length; i += 4) {
				let gray = grayscaleValues[i / 4]!

				// Invert if dark theme
				if (isDarkTheme) {
					gray = 255 - gray
				}

				// Apply contrast enhancement (S-curve)
				const contrast = 2.0
				let normalized = gray / 255
				normalized = 1 / (1 + Math.exp(-contrast * (normalized - 0.5) * 10))
				gray = Math.round(normalized * 255)

				// Apply threshold for binary image (better for OCR)
				const binaryThreshold = isDarkTheme ? 255 - threshold : threshold
				const finalValue = gray > binaryThreshold ? 255 : 0

				data[i] = finalValue
				data[i + 1] = finalValue
				data[i + 2] = finalValue
			}

			ctx.putImageData(imageData, 0, 0)

			// Return as high-quality PNG
			resolve(canvas.toDataURL("image/png", 1.0))
		}

		img.onerror = () => {
			reject(new Error("Failed to load image"))
		}

		// Handle different input types
		if (typeof imageSource === "string") {
			img.src = imageSource
		} else {
			const reader = new FileReader()
			reader.onload = (e) => {
				img.src = e.target?.result as string
			}
			reader.onerror = () => reject(new Error("Failed to read file"))
			reader.readAsDataURL(imageSource)
		}
	})
}

/**
 * Alternative preprocessing with less aggressive processing
 * (fallback if binary produces poor results)
 */
export const preprocessImageSoft = async (
	imageSource: string | File | Blob
): Promise<string> => {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.crossOrigin = "anonymous"

		img.onload = () => {
			const scale = 2
			const canvas = document.createElement("canvas")
			const ctx = canvas.getContext("2d")

			if (!ctx) {
				reject(new Error("Failed to get canvas context"))
				return
			}

			canvas.width = img.width * scale
			canvas.height = img.height * scale
			ctx.imageSmoothingEnabled = true
			ctx.imageSmoothingQuality = "high"
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
			const data = imageData.data

			// Calculate average brightness
			let totalBrightness = 0
			for (let i = 0; i < data.length; i += 4) {
				totalBrightness += (data[i]! + data[i + 1]! + data[i + 2]!) / 3
			}
			const avgBrightness = totalBrightness / (data.length / 4)
			const isDarkTheme = avgBrightness < 100

			for (let i = 0; i < data.length; i += 4) {
				// Grayscale
				let gray =
					0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!

				// Invert if dark
				if (isDarkTheme) {
					gray = 255 - gray
				}

				// Gentle contrast boost
				const contrast = 1.3
				const factor =
					(259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100))
				gray = Math.min(255, Math.max(0, factor * (gray - 128) + 128))

				data[i] = gray
				data[i + 1] = gray
				data[i + 2] = gray
			}

			ctx.putImageData(imageData, 0, 0)
			resolve(canvas.toDataURL("image/png", 1.0))
		}

		img.onerror = () => reject(new Error("Failed to load image"))

		if (typeof imageSource === "string") {
			img.src = imageSource
		} else {
			const reader = new FileReader()
			reader.onload = (e) => {
				img.src = e.target?.result as string
			}
			reader.onerror = () => reject(new Error("Failed to read file"))
			reader.readAsDataURL(imageSource)
		}
	})
}

/**
 * Perform OCR on an image with multiple preprocessing attempts
 *
 * @param imageSource - Image URL, File, or Blob
 * @param onProgress - Progress callback for UI updates
 * @param preprocess - Whether to preprocess the image (default: true)
 * @returns OCR result with text, confidence, and lines
 */
export const recognizeImage = async (
	imageSource: string | File | Blob,
	onProgress?: ProgressCallback,
	preprocess = true
): Promise<OcrRawResult> => {
	const runOcr = async (
		image: string | File | Blob
	): Promise<Tesseract.RecognizeResult> => {
		return Tesseract.recognize(image, "por+eng", {
			logger: (info) => {
				if (info.status && onProgress) {
					const progress = Math.round((info.progress ?? 0) * 100)
					onProgress({
						status: mapStatus(info.status),
						progress,
						message: getProgressMessage(info.status),
					})
				}
			},
		})
	}

	try {
		onProgress?.({
			status: "loading",
			progress: 0,
			message: getProgressMessage("loading"),
		})

		let result: Tesseract.RecognizeResult

		if (preprocess) {
			// Try aggressive preprocessing first
			const processedImage = await preprocessImage(imageSource)
			result = await runOcr(processedImage)

			// If confidence is low, try soft preprocessing
			if (result.data.confidence < 60) {
				onProgress?.({
					status: "recognizing",
					progress: 50,
					message: "ocr.progress.alternativeProcessing",
				})

				const softProcessed = await preprocessImageSoft(imageSource)
				const softResult = await runOcr(softProcessed)

				// Use whichever has better confidence
				if (softResult.data.confidence > result.data.confidence) {
					result = softResult
				}
			}
		} else {
			result = await runOcr(imageSource)
		}

		onProgress?.({
			status: "complete",
			progress: 100,
			message: "ocr.progress.complete",
		})

		// Split text into lines
		const lines = result.data.text
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0)

		return {
			text: result.data.text,
			confidence: result.data.confidence,
			lines,
		}
	} catch (error) {
		onProgress?.({
			status: "error",
			progress: 0,
			message: error instanceof Error ? error.message : "ocr.progress.failed",
		})
		throw error
	}
}

/**
 * Check if Tesseract is available in the browser
 */
export const isTesseractAvailable = (): boolean => {
	return typeof window !== "undefined" && typeof Tesseract !== "undefined"
}

export { Tesseract }
