"use client"

import { useState, useCallback, useEffect } from "react"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface LightboxImage {
	src: string
	alt?: string
}

interface ImageLightboxProps {
	images: LightboxImage[]
	initialIndex?: number
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Fullscreen image lightbox with carousel navigation.
 * Uses Radix Dialog for modal behavior (focus trap, Escape, overlay).
 * Arrow keys + click navigation for multiple images.
 */
const ImageLightbox = ({
	images,
	initialIndex = 0,
	open,
	onOpenChange,
}: ImageLightboxProps) => {
	const t = useTranslations("common")
	const [currentIndex, setCurrentIndex] = useState(initialIndex)

	// Reset to initial index when opening
	useEffect(() => {
		if (open) setCurrentIndex(initialIndex)
	}, [open, initialIndex])

	const hasMultiple = images.length > 1

	const handlePrev = useCallback(() => {
		setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
	}, [images.length])

	const handleNext = useCallback(() => {
		setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
	}, [images.length])

	// Keyboard navigation
	useEffect(() => {
		if (!open || !hasMultiple) return

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft") handlePrev()
			if (e.key === "ArrowRight") handleNext()
		}
		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [open, hasMultiple, handlePrev, handleNext])

	if (images.length === 0) return null

	const current = images[currentIndex]

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				id="image-lightbox"
				aria-describedby={undefined}
				className="border-bg-300 bg-bg-100/95 !h-[90vh] !max-h-none !w-[95vw] !max-w-none !p-0 backdrop-blur-sm"
			>
				<DialogTitle className="sr-only">
					{current?.alt ??
						t("imageUpload.thumbnail", { index: currentIndex + 1 })}
				</DialogTitle>

				{/* Image container */}
				<div className="p-m-500 relative h-full w-full overflow-auto">
					{/* Current image */}
					<div className="flex min-h-full w-full items-center justify-center">
						<img
							src={current?.src}
							alt={
								current?.alt ??
								t("imageUpload.thumbnail", { index: currentIndex + 1 })
							}
							className="max-w-full rounded-md"
						/>
					</div>

					{/* Navigation arrows */}
					{hasMultiple && (
						<>
							<Button
								id="lightbox-prev"
								type="button"
								variant="ghost"
								size="icon"
								onClick={(e) => {
									e.stopPropagation()
									handlePrev()
								}}
								className="left-m-400 bg-txt-100 text-bg-100 hover:bg-txt-100/90 hover:text-bg-100 absolute top-1/2 z-10 size-12 -translate-y-1/2 rounded-full shadow-lg"
								aria-label={t("previous")}
							>
								<ChevronLeft className="h-6 w-6" />
							</Button>
							<Button
								id="lightbox-next"
								type="button"
								variant="ghost"
								size="icon"
								onClick={(e) => {
									e.stopPropagation()
									handleNext()
								}}
								className="right-m-400 bg-txt-100 text-bg-100 hover:bg-txt-100/90 hover:text-bg-100 absolute top-1/2 z-10 size-12 -translate-y-1/2 rounded-full shadow-lg"
								aria-label={t("next")}
							>
								<ChevronRight className="h-6 w-6" />
							</Button>
						</>
					)}
				</div>

				{/* Dot indicators */}
				{hasMultiple && (
					<div className="bottom-m-400 gap-s-100 absolute left-1/2 flex -translate-x-1/2 items-center">
						{images.map((_, index) => (
							<button
								key={index}
								type="button"
								onClick={() => setCurrentIndex(index)}
								className="p-s-200 flex items-center justify-center focus-visible:outline-none"
								aria-label={t("imageUpload.thumbnail", { index: index + 1 })}
							>
								<span
									className={cn(
										"block h-2 rounded-full transition-all",
										index === currentIndex
											? "bg-acc-100 w-6"
											: "bg-txt-300/40 hover:bg-txt-300/60 w-2"
									)}
								/>
							</button>
						))}
					</div>
				)}

				{/* Counter */}
				{hasMultiple && (
					<div className="top-m-400 left-m-400 bg-bg-200/80 px-s-300 py-s-100 text-tiny text-txt-200 absolute rounded-md">
						{currentIndex + 1} / {images.length}
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

export { ImageLightbox }
export type { LightboxImage, ImageLightboxProps }
