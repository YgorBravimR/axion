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

		const response = await fetch("/api/uploads", {
			method: "POST",
			body: formData,
		})

		const result = await response.json()

		if (result.status === "success" && result.data) {
			uploaded.push({ url: result.data.url, s3Key: result.data.s3Key })
			URL.revokeObjectURL(pending.previewUrl)
		} else {
			errors.push(result.message ?? `Failed to upload ${pending.file.name}`)
		}
	}

	return { uploaded, errors }
}

export { uploadFiles, type UploadFilesParams, type UploadFilesResult }
