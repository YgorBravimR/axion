import { z } from "zod"
import type {
	PersistedImage,
	PendingImage,
	UploadPath,
} from "@/lib/validations/upload"

interface UploadFilesParams {
	pendingImages: PendingImage[]
	path: UploadPath
	entityId: string
}

interface UploadFilesResult {
	uploaded: PersistedImage[]
	errors: string[]
}

// Zod schema for the /api/uploads response
const UploadResponseSchema = z.union([
	z.object({
		status: z.literal("success"),
		data: z.object({
			url: z.string(),
			s3Key: z.string(),
		}),
	}),
	z.object({
		status: z.string(),
		message: z.string().optional(),
	}),
])

/**
 * Upload pending (local blob) images to S3 via /api/uploads.
 * Called during form submit — not inside the ImageUpload component.
 * Sequential uploads to keep things simple (max 3 images per scenario, 1 elsewhere).
 */
const uploadFiles = async ({
	pendingImages,
	path,
	entityId,
}: UploadFilesParams): Promise<UploadFilesResult> => {
	const uploaded: PersistedImage[] = []
	const errors: string[] = []

	for (const pending of pendingImages) {
		const formData = new FormData()
		formData.append("file", pending.file)
		formData.append("path", path)
		formData.append("entityId", entityId)

		// eslint-disable-next-line no-await-in-loop -- sequential file uploads to avoid overwhelming the upload API and to accumulate per-file errors
		const response = await fetch("/api/uploads", {
			method: "POST",
			body: formData,
		})

		// eslint-disable-next-line no-await-in-loop -- sequential uploads intentional; response.json() returns unknown, immediately validated by Zod schema
		const rawResult = await response.json()
		const result = UploadResponseSchema.parse(rawResult)

		if (result.status === "success" && "data" in result) {
			uploaded.push({ url: result.data.url, s3Key: result.data.s3Key })
			URL.revokeObjectURL(pending.previewUrl)
		} else if ("message" in result && result.message) {
			errors.push(result.message)
		} else {
			errors.push(`upload.errors.uploadFailed|${pending.file.name}`)
		}
	}

	return { uploaded, errors }
}

export { uploadFiles, type UploadFilesParams, type UploadFilesResult }
