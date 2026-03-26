"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { X, Camera, Loader2, Send } from "lucide-react"
import { toPng } from "html-to-image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ImageUpload } from "@/components/shared/image-upload"
import { useToast } from "@/components/ui/toast"
import { useBugReport } from "./bug-report-provider"
import { submitBugReport } from "@/app/actions/bug-reports"
import { uploadFiles } from "@/lib/upload-files"
import { getConsoleLogs, getNetworkErrors } from "@/lib/bug-report-capture"
import { cn } from "@/lib/utils"
import type { PendingImage } from "@/lib/validations/upload"

const BugReportPanel = () => {
	const { isOpen, closeBugReport } = useBugReport()
	const t = useTranslations("bugReport.panel")
	const tCommon = useTranslations("common")
	const { showToast } = useToast()

	const [subject, setSubject] = useState("")
	const [description, setDescription] = useState("")
	const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [isCapturing, setIsCapturing] = useState(false)
	const panelRef = useRef<HTMLDivElement>(null)
	const subjectInputRef = useRef<HTMLInputElement>(null)

	// Auto-focus subject input on open
	useEffect(() => {
		if (isOpen) {
			// Small delay to let the panel render before focusing
			const timeout = setTimeout(() => subjectInputRef.current?.focus(), 50)
			return () => clearTimeout(timeout)
		}
	}, [isOpen])

	// Close on Escape + focus trap
	useEffect(() => {
		if (!isOpen) return

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				// Don't close the panel if a dialog (lightbox) is open — let it close first
				const openDialog = document.querySelector(
					"[data-state='open'][role='dialog']"
				)
				if (openDialog && !panelRef.current?.contains(openDialog)) return
				closeBugReport()
				return
			}

			// Focus trap: keep Tab within the panel
			if (e.key === "Tab" && panelRef.current) {
				const focusable = panelRef.current.querySelectorAll<HTMLElement>(
					'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'
				)
				if (focusable.length === 0) return

				const first = focusable[0]
				const last = focusable[focusable.length - 1]

				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault()
					last.focus()
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault()
					first.focus()
				}
			}
		}
		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [isOpen, closeBugReport])

	const handleReset = useCallback(() => {
		setSubject("")
		setDescription("")
		for (const img of pendingImages) {
			URL.revokeObjectURL(img.previewUrl)
		}
		setPendingImages([])
	}, [pendingImages])

	const handleTakeScreenshot = useCallback(async () => {
		setIsCapturing(true)
		try {
			// Capture main content area
			const target = document.getElementById("main-content") ?? document.body
			const dataUrl = await toPng(target, {
				quality: 0.8,
				pixelRatio: 1,
				cacheBust: true,
				filter: (node: HTMLElement) =>
					node !== panelRef.current && node.tagName !== "IFRAME",
			})

			// Convert data URL to blob without fetch() — avoids CSP connect-src restrictions
			const byteString = atob(dataUrl.split(",")[1])
			const mimeType = dataUrl.split(",")[0].split(":")[1].split(";")[0]
			const ab = new ArrayBuffer(byteString.length)
			const ia = new Uint8Array(ab)
			for (let i = 0; i < byteString.length; i++) {
				ia[i] = byteString.charCodeAt(i)
			}
			const blob = new Blob([ab], { type: mimeType })

			const file = new File([blob], `screenshot-${Date.now()}.png`, {
				type: "image/png",
			})
			const previewUrl = URL.createObjectURL(file)
			setPendingImages((prev) => [...prev, { file, previewUrl }])
		} catch (error) {
			console.error("[BugReport] Screenshot failed:", error)
			showToast("error", t("screenshotFailed"))
		} finally {
			setIsCapturing(false)
		}
	}, [showToast, t])

	const handleFileAdd = useCallback((pending: PendingImage) => {
		setPendingImages((prev) => [...prev, pending])
	}, [])

	const handlePendingRemove = useCallback((previewUrl: string) => {
		setPendingImages((prev) =>
			prev.filter((img) => img.previewUrl !== previewUrl)
		)
	}, [])

	const handleSubmit = useCallback(async () => {
		if (!subject.trim() || !description.trim()) return

		setIsSubmitting(true)
		try {
			// Upload images first
			let uploadedImages: {
				imageUrl: string
				s3Key: string
				isScreenshot: boolean
			}[] = []

			if (pendingImages.length > 0) {
				// Use a temporary ID for upload path — the server action will associate them
				const tempId = crypto.randomUUID()
				const { uploaded } = await uploadFiles({
					pendingImages,
					path: "bug-reports",
					entityId: tempId,
				})

				uploadedImages = uploaded.map((img) => ({
					imageUrl: img.url,
					s3Key: img.s3Key,
					isScreenshot: false,
				}))
			}

			const result = await submitBugReport({
				subject: subject.trim(),
				description: description.trim(),
				currentUrl: window.location.href,
				userAgent: navigator.userAgent,
				consoleLogs: getConsoleLogs() || undefined,
				networkErrors: getNetworkErrors() || undefined,
				images: uploadedImages.length > 0 ? uploadedImages : undefined,
			})

			if (result.status === "success") {
				showToast("success", t("success"))
				handleReset()
				closeBugReport()
			} else {
				showToast("error", t("error"))
			}
		} catch {
			showToast("error", t("error"))
		} finally {
			setIsSubmitting(false)
		}
	}, [
		subject,
		description,
		pendingImages,
		showToast,
		t,
		handleReset,
		closeBugReport,
	])

	if (!isOpen) return null

	const canSubmit =
		subject.trim().length > 0 && description.trim().length > 0 && !isSubmitting

	return (
		<div
			ref={panelRef}
			role="dialog"
			aria-label={t("title")}
			aria-modal="true"
			className={cn(
				"fixed right-6 bottom-6 z-50 flex w-96 max-w-[calc(100vw-1rem)] flex-col",
				"border-txt-100 bg-bg-100 rounded-lg border shadow-2xl",
				"animate-in slide-in-from-bottom-5 fade-in max-h-[80vh] duration-200",
				"motion-reduce:animate-none"
			)}
		>
			{/* Header */}
			<div className="border-bg-200/50 px-m-500 py-m-400 flex items-center justify-between border-b">
				<h2 className="text-body text-txt-100 font-medium">{t("title")}</h2>
				<Button
					id="bug-report-close"
					type="button"
					variant="ghost"
					size="icon"
					onClick={closeBugReport}
					className="size-8"
					aria-label={tCommon("close")}
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			{/* Body */}
			<div className="space-y-m-400 px-m-500 py-m-400 flex-1 overflow-y-auto">
				{/* Subject */}
				<div className="space-y-s-100">
					<label
						htmlFor="bug-subject"
						className="text-tiny text-txt-200 font-medium"
					>
						{t("subjectLabel")}
					</label>
					<Input
						ref={subjectInputRef}
						id="bug-subject"
						value={subject}
						onChange={(e) => setSubject(e.target.value)}
						placeholder={t("subjectPlaceholder")}
						maxLength={200}
						disabled={isSubmitting}
					/>
				</div>

				{/* Description */}
				<div className="space-y-s-100">
					<label
						htmlFor="bug-description"
						className="text-tiny text-txt-200 font-medium"
					>
						{t("descriptionLabel")}
					</label>
					<Textarea
						id="bug-description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder={t("descriptionPlaceholder")}
						rows={3}
						disabled={isSubmitting}
					/>
				</div>

				{/* Screenshot button */}
				<Button
					id="bug-report-screenshot"
					type="button"
					variant="outline"
					size="sm"
					onClick={handleTakeScreenshot}
					disabled={isCapturing || isSubmitting || pendingImages.length >= 3}
					className="w-full"
				>
					{isCapturing ? (
						<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
					) : (
						<Camera className="mr-s-200 h-4 w-4" />
					)}
					{isCapturing ? t("capturingScreenshot") : t("takeScreenshot")}
				</Button>

				{/* Image upload */}
				<div className="space-y-s-100">
					<span className="text-tiny text-txt-200 font-medium">
						{t("imagesLabel")}
					</span>
					<ImageUpload
						pendingImages={pendingImages}
						onFileAdd={handleFileAdd}
						onPendingRemove={handlePendingRemove}
						maxImages={3}
					/>
				</div>
			</div>

			{/* Footer */}
			<div className="border-bg-200/50 px-m-500 py-m-400 border-t">
				<Button
					id="bug-report-submit"
					type="button"
					onClick={handleSubmit}
					disabled={!canSubmit}
					className="w-full"
				>
					{isSubmitting ? (
						<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
					) : (
						<Send className="mr-s-200 h-4 w-4" />
					)}
					{isSubmitting ? t("submitting") : t("submit")}
				</Button>
			</div>
		</div>
	)
}

export { BugReportPanel }
