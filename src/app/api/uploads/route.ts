/**
 * POST /api/uploads — Upload an image to S3-compatible storage
 * DELETE /api/uploads — Delete an image from S3-compatible storage
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { uploadFile, deleteFile } from "@/lib/storage"
import { validateFile, buildS3Key, uploadSchema } from "@/lib/validations/upload"

export const POST = async (request: NextRequest) => {
	const session = await auth()
	if (!session?.user?.id) {
		return NextResponse.json(
			{ status: "error", message: "Unauthorized" },
			{ status: 401 }
		)
	}

	const formData = await request.formData()
	const file = formData.get("file") as File | null
	const path = formData.get("path") as string | null
	const entityId = formData.get("entityId") as string | null

	if (!file || !path || !entityId) {
		return NextResponse.json(
			{ status: "error", message: "Missing required fields: file, path, entityId" },
			{ status: 400 }
		)
	}

	// Validate upload metadata
	const metaResult = uploadSchema.safeParse({ path, entityId })
	if (!metaResult.success) {
		return NextResponse.json(
			{
				status: "error",
				message: "Invalid upload parameters",
				errors: metaResult.error.issues.map((issue) => ({
					code: "VALIDATION_ERROR",
					detail: `${issue.path.join(".")}: ${issue.message}`,
				})),
			},
			{ status: 400 }
		)
	}

	// Validate file type and size
	const fileError = validateFile(file)
	if (fileError) {
		return NextResponse.json(
			{ status: "error", message: fileError },
			{ status: 400 }
		)
	}

	const buffer = Buffer.from(await file.arrayBuffer())
	const s3Key = buildS3Key(metaResult.data.path, metaResult.data.entityId, file.name)

	const result = await uploadFile({
		key: s3Key,
		body: buffer,
		contentType: file.type,
	})

	return NextResponse.json({
		status: "success",
		message: "File uploaded successfully",
		data: { url: result.url, s3Key: result.s3Key },
	})
}

export const DELETE = async (request: NextRequest) => {
	const session = await auth()
	if (!session?.user?.id) {
		return NextResponse.json(
			{ status: "error", message: "Unauthorized" },
			{ status: 401 }
		)
	}

	const body = await request.json()
	const { s3Key } = body as { s3Key?: string }

	if (!s3Key) {
		return NextResponse.json(
			{ status: "error", message: "Missing required field: s3Key" },
			{ status: 400 }
		)
	}

	await deleteFile(s3Key)

	return NextResponse.json({
		status: "success",
		message: "File deleted successfully",
	})
}
