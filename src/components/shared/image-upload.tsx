"use client"

import { useRef, useCallback, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { X, ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from "@/lib/validations/upload"
import type { PersistedImage, PendingImage } from "@/lib/validations/upload"

interface ImageUploadProps {
	persistedImages?: PersistedImage[]
	pendingImages?: PendingImage[]
	onFileAdd: (pending: PendingImage) => void
	onPendingRemove: (previewUrl: string) => void
	onPersistedRemove?: (s3Key: string) => void
	maxImages?: number
	className?: string
}

const ImageUpload = ({
	persistedImages = [],
	pendingImages = [],
	onFileAdd,
	onPendingRemove,
	onPersistedRemove,
	maxImages = 1,
	className,
}: ImageUploadProps) => {
	const t = useTranslations("common")
	const [error, setError] = useState<string | null>(null)
	const [isDragOver, setIsDragOver] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const totalImages = persistedImages.length + pendingImages.length
	const canUpload = totalImages < maxImages

	// Unified thumbnail list: persisted images (S3) first, then pending (local blobs)
	const thumbnails = [
		...persistedImages.map((img) => ({
			key: img.s3Key,
			src: img.url,
			borderClass: "border-bg-300",
			onRemove: () => onPersistedRemove?.(img.s3Key),
		})),
		...pendingImages.map((img) => ({
			key: img.previewUrl,
			src: img.previewUrl,
			borderClass: "border-acc-100/30",
			onRemove: () => {
				URL.revokeObjectURL(img.previewUrl)
				onPendingRemove(img.previewUrl)
			},
		})),
	]

	const handleFileSelect = useCallback(
		(file: File) => {
			if (!canUpload) return

			// Client-side validation
			if (
				!ACCEPTED_IMAGE_TYPES.includes(
					file.type as (typeof ACCEPTED_IMAGE_TYPES)[number]
				)
			) {
				setError(t("imageUpload.invalidFileType"))
				return
			}
			if (file.size > MAX_FILE_SIZE) {
				setError(
					t("imageUpload.fileTooLarge", {
						maxSize: MAX_FILE_SIZE / 1024 / 1024,
					})
				)
				return
			}

			setError(null)
			const previewUrl = URL.createObjectURL(file)
			onFileAdd({ file, previewUrl })
		},
		[canUpload, onFileAdd]
	)

	const handleInputChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0]
			if (file) handleFileSelect(file)
			// Reset so the same file can be re-selected
			if (fileInputRef.current) fileInputRef.current.value = ""
		},
		[handleFileSelect]
	)

	const handleDrop = useCallback(
		(e: DragEvent) => {
			e.preventDefault()
			setIsDragOver(false)
			const file = e.dataTransfer.files[0]
			if (file) handleFileSelect(file)
		},
		[handleFileSelect]
	)

	const handleDragOver = useCallback((e: DragEvent) => {
		e.preventDefault()
		setIsDragOver(true)
	}, [])

	const handleDragLeave = useCallback((e: DragEvent) => {
		e.preventDefault()
		setIsDragOver(false)
	}, [])

	return (
		<div className={cn("space-y-s-300", className)}>
			{/* Image thumbnails (persisted + pending) */}
			{thumbnails.length > 0 && (
				<div className="gap-s-300 grid grid-cols-2 sm:grid-cols-3">
					{thumbnails.map((thumb, index) => (
						<div
							key={thumb.key}
							className={cn(
								"group relative overflow-hidden rounded-lg border",
								thumb.borderClass
							)}
						>
							<img
								src={thumb.src}
								alt=""
								className="aspect-video w-full object-cover"
							/>
							<Button
								id={`image-remove-${index}`}
								type="button"
								variant="ghost"
								size="sm"
								className="bg-bg-100/80 absolute top-1 right-1 h-9 w-9 p-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
								onClick={thumb.onRemove}
								aria-label={t("remove")}
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					))}
				</div>
			)}

			{/* Upload zone */}
			{canUpload && (
				<div
					role="button"
					tabIndex={0}
					className={cn(
						"border-bg-300 p-l-700 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors focus-visible:ring-2 focus-visible:ring-acc-100 focus-visible:ring-offset-2 focus-visible:outline-none",
						isDragOver && "border-acc-100 bg-acc-100/5"
					)}
					onClick={() => fileInputRef.current?.click()}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ")
							fileInputRef.current?.click()
					}}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					aria-label={t("imageUpload.uploadImage")}
				>
					<ImageIcon className="text-txt-300 mb-s-200 h-8 w-8" />
					<p className="text-small text-txt-200">
						<span className="text-acc-100 font-medium">{t("upload")}</span>{" "}
						{t("imageUpload.dragAndDrop")}
					</p>
					<p className="text-caption text-txt-300 mt-s-100">
						{t("imageUpload.acceptedFormats", {
							maxSize: MAX_FILE_SIZE / 1024 / 1024,
						})}
					</p>
					<input
						ref={fileInputRef}
						type="file"
						accept={ACCEPTED_IMAGE_TYPES.join(",")}
						className="hidden"
						onChange={handleInputChange}
						aria-hidden="true"
					/>
				</div>
			)}

			{/* Error */}
			{error && <p className="text-small text-fb-error">{error}</p>}
		</div>
	)
}

export { ImageUpload, type ImageUploadProps }
