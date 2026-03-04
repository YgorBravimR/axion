import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
} from "@aws-sdk/client-s3"

interface StorageConfig {
	endpoint: string
	region: string
	bucket: string
	accessKeyId: string
	secretAccessKey: string
	publicUrl: string
}

interface UploadParams {
	key: string
	body: Buffer
	contentType: string
}

interface UploadResult {
	url: string
	s3Key: string
}

const getStorageConfig = (): StorageConfig => {
	const endpoint = process.env.S3_ENDPOINT
	const region = process.env.S3_REGION ?? "auto"
	const bucket = process.env.S3_BUCKET
	const accessKeyId = process.env.S3_ACCESS_KEY_ID
	const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
	const publicUrl = process.env.S3_PUBLIC_URL

	if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicUrl) {
		throw new Error(
			"Missing S3 configuration. Required: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL"
		)
	}

	return { endpoint, region, bucket, accessKeyId, secretAccessKey, publicUrl }
}

const createS3Client = (config: StorageConfig): S3Client =>
	new S3Client({
		endpoint: config.endpoint,
		region: config.region,
		forcePathStyle: true,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
	})

const buildPublicUrl = (s3Key: string): string => {
	const config = getStorageConfig()
	const base = config.publicUrl.replace(/\/$/, "")
	return `${base}/${s3Key}`
}

/**
 * Upload a file to S3-compatible storage.
 * S3 key convention: {entityType}/{uuid}/{timestamp}-{hash}.{ext}
 */
const uploadFile = async ({ key, body, contentType }: UploadParams): Promise<UploadResult> => {
	const config = getStorageConfig()
	const client = createS3Client(config)

	await client.send(
		new PutObjectCommand({
			Bucket: config.bucket,
			Key: key,
			Body: body,
			ContentType: contentType,
		})
	)

	return {
		url: buildPublicUrl(key),
		s3Key: key,
	}
}

/**
 * Delete a file from S3-compatible storage.
 */
const deleteFile = async (s3Key: string): Promise<void> => {
	const config = getStorageConfig()
	const client = createS3Client(config)

	await client.send(
		new DeleteObjectCommand({
			Bucket: config.bucket,
			Key: s3Key,
		})
	)
}

export {
	uploadFile,
	deleteFile,
	buildPublicUrl,
	getStorageConfig,
	type StorageConfig,
	type UploadParams,
	type UploadResult,
}
