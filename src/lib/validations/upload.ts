import { z } from "zod"

/** Image already persisted in S3 (displayed in edit mode) */
interface PersistedImage {
	url: string
	s3Key: string
}

/** Local blob not yet uploaded — lives until form submit */
interface PendingImage {
	file: File
	previewUrl: string // URL.createObjectURL(file)
}

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

type ImageMimeType = (typeof ACCEPTED_IMAGE_TYPES)[number]

const UPLOAD_PATHS = ["playbooks", "scenarios", "trades", "bug-reports"] as const
type UploadPath = (typeof UPLOAD_PATHS)[number]

const uploadSchema = z.object({
	path: z.enum(UPLOAD_PATHS),
	entityId: z.string().uuid(),
})

/**
 * Validate file type and size on the server side.
 * Returns error message key or null if valid.
 */
const validateFile = (file: File): string | null => {
	if (!ACCEPTED_IMAGE_TYPES.includes(file.type as ImageMimeType)) {
		return "validation.upload.invalidFileType"
	}
	if (file.size > MAX_FILE_SIZE) {
		return "validation.upload.fileTooLarge"
	}
	return null
}

/**
 * Build S3 key from entity path and ID.
 * Convention: {entityType}/{entityId}/{timestamp}-{random}.{ext}
 */
const buildS3Key = (
	path: UploadPath,
	entityId: string,
	fileName: string
): string => {
	const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg"
	const timestamp = Date.now()
	const random = Math.random().toString(36).substring(2, 10)
	return `${path}/${entityId}/${timestamp}-${random}.${ext}`
}

export {
	ACCEPTED_IMAGE_TYPES,
	MAX_FILE_SIZE,
	UPLOAD_PATHS,
	uploadSchema,
	validateFile,
	buildS3Key,
	type PersistedImage,
	type PendingImage,
	type UploadPath,
}
