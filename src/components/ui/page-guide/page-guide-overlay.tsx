"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { GuideStep } from "@/types/page-guide"

interface PageGuideOverlayProps {
	step: GuideStep
	pageKey: string
	currentStep: number
	totalSteps: number
	onNext: () => void
	onPrev: () => void
	onClose: () => void
}

interface TargetRect {
	top: number
	left: number
	width: number
	height: number
}

const SPOTLIGHT_PADDING = 8
const CALLOUT_GAP = 12
const CALLOUT_WIDTH = 320
const CALLOUT_HEIGHT_ESTIMATE = 180

const PageGuideOverlay = ({
	step,
	pageKey,
	currentStep,
	totalSteps,
	onNext,
	onPrev,
	onClose,
}: PageGuideOverlayProps) => {
	const t = useTranslations("pageGuide")
	// renderedRect is what we actually draw — only updated at safe moments
	const [renderedRect, setRenderedRect] = useState<TargetRect | null>(null)
	const [isVisible, setIsVisible] = useState(true)
	const overlayRef = useRef<HTMLDivElement>(null)
	const calloutRef = useRef<HTMLDivElement>(null)
	const prevStepIdRef = useRef(step.targetId)
	const transitionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

	/** Measure a DOM element by id and return its rect (without setting state) */
	const getElementRect = useCallback((id: string): TargetRect | null => {
		const element = document.getElementById(id)
		if (!element) return null
		const rect = element.getBoundingClientRect()
		return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
	}, [])

	/**
	 * Scrolls the target element into the center of the visible area.
	 */
	const scrollTargetIntoView = useCallback(() => {
		const element = document.getElementById(step.targetId)
		if (!element) return

		const findScrollParent = (el: HTMLElement): HTMLElement | null => {
			let current = el.parentElement
			while (current) {
				const style = getComputedStyle(current)
				const overflowY = style.overflowY
				if (
					(overflowY === "auto" || overflowY === "scroll") &&
					current.scrollHeight > current.clientHeight
				) {
					return current
				}
				current = current.parentElement
			}
			return null
		}

		const scrollParent = findScrollParent(element)

		if (scrollParent) {
			const elRect = element.getBoundingClientRect()
			const parentRect = scrollParent.getBoundingClientRect()
			const elCenterInParent = elRect.top - parentRect.top + elRect.height / 2
			const desiredScrollTop =
				scrollParent.scrollTop + elCenterInParent - parentRect.height / 2
			scrollParent.scrollTo({
				top: Math.max(0, desiredScrollTop),
				behavior: "smooth",
			})
		} else {
			element.scrollIntoView({ behavior: "smooth", block: "center" })
		}
	}, [step.targetId])

	/** Clear any pending transition timers */
	const clearTimers = useCallback(() => {
		for (const t of transitionTimersRef.current) clearTimeout(t)
		transitionTimersRef.current = []
	}, [])

	/**
	 * Step transition: fade out spotlight → scroll → measure at final pos → fade in
	 * The key: renderedRect is FROZEN during fade-out and scroll, only updated before fade-in.
	 */
	useEffect(() => {
		const isStepChange = prevStepIdRef.current !== step.targetId
		prevStepIdRef.current = step.targetId

		if (!isStepChange) {
			// First mount — measure and show immediately
			setRenderedRect(getElementRect(step.targetId))
			setIsVisible(true)
			return
		}

		// Step changed — clear any in-flight timers from a previous rapid click
		clearTimers()

		// 1. Fade out (keep renderedRect frozen at old position)
		setIsVisible(false)

		// 2. After fade-out completes (200ms), start scrolling
		const t1 = setTimeout(() => {
			scrollTargetIntoView()

			// 3. After scroll settles (~450ms), measure new position and fade in
			const t2 = setTimeout(() => {
				setRenderedRect(getElementRect(step.targetId))
				// Allow one frame for the rect to render at new position before fading in
				requestAnimationFrame(() => {
					setIsVisible(true)
				})
			}, 450)
			transitionTimersRef.current.push(t2)
		}, 200)
		transitionTimersRef.current.push(t1)

		return clearTimers
	}, [step.targetId, scrollTargetIntoView, getElementRect, clearTimers])

	// Live tracking: keep renderedRect in sync with scroll/resize — but ONLY when visible
	useEffect(() => {
		const element = document.getElementById(step.targetId)
		if (!element) return

		const rafPending = { current: false }

		const update = () => {
			if (!isVisible) return
			if (rafPending.current) return
			rafPending.current = true
			requestAnimationFrame(() => {
				rafPending.current = false
				setRenderedRect(getElementRect(step.targetId))
			})
		}

		const resizeObserver = new ResizeObserver(update)
		resizeObserver.observe(element)
		window.addEventListener("scroll", update, true)
		window.addEventListener("resize", update)

		return () => {
			resizeObserver.disconnect()
			window.removeEventListener("scroll", update, true)
			window.removeEventListener("resize", update)
		}
	}, [step.targetId, getElementRect, isVisible])

	// Focus trap
	useEffect(() => {
		if (overlayRef.current) {
			overlayRef.current.focus()
		}
	}, [currentStep])

	const spotlightX = renderedRect ? renderedRect.left - SPOTLIGHT_PADDING : 0
	const spotlightY = renderedRect ? renderedRect.top - SPOTLIGHT_PADDING : 0
	const spotlightW = renderedRect ? renderedRect.width + SPOTLIGHT_PADDING * 2 : 0
	const spotlightH = renderedRect ? renderedRect.height + SPOTLIGHT_PADDING * 2 : 0

	const calloutStyle = computeCalloutPosition(step.placement, renderedRect, calloutRef.current)

	const isFirst = currentStep === 1
	const isLast = currentStep === totalSteps

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label={t(`${pageKey}.${step.titleKey}`)}
			tabIndex={-1}
			className="fixed inset-0 z-50 outline-none"
			onClick={onClose}
		>
			{/* SVG Spotlight Mask — scrim always visible, cutout hole fades in/out */}
			<svg
				className="absolute inset-0 h-full w-full"
				aria-hidden="true"
			>
				<defs>
					<mask id="page-guide-mask">
						<rect x="0" y="0" width="100%" height="100%" fill="white" />
						<rect
							x={spotlightX}
							y={spotlightY}
							width={spotlightW}
							height={spotlightH}
							rx="8"
							ry="8"
							fill="black"
							style={{
								fillOpacity: isVisible ? 1 : 0,
								transition: "fill-opacity 200ms ease-out",
							}}
						/>
					</mask>
				</defs>
				<rect
					x="0"
					y="0"
					width="100%"
					height="100%"
					fill="rgba(0, 0, 0, 0.7)"
					mask="url(#page-guide-mask)"
				/>
			</svg>

			{/* Spotlight border ring */}
			{renderedRect && (
				<div
					className="pointer-events-none absolute rounded-lg border border-acc-100/40"
					style={{
						top: spotlightY,
						left: spotlightX,
						width: spotlightW,
						height: spotlightH,
						opacity: isVisible ? 1 : 0,
						transition: "opacity 200ms ease-out",
					}}
					aria-hidden="true"
				/>
			)}

			{/* Callout Card — content only, no navigation */}
			<div
				ref={calloutRef}
				className="absolute z-10 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-acc-100/30 bg-bg-200 p-m-400 shadow-lg"
				style={{
					...calloutStyle,
					opacity: isVisible ? 1 : 0,
					transition: "opacity 200ms ease-out",
				}}
				onClick={(event) => event.stopPropagation()}
				role="document"
			>
				{/* Close button */}
				<button
					type="button"
					onClick={onClose}
					className="absolute right-2 top-2 rounded-sm p-s-100 text-txt-300 transition-colors hover:text-txt-100"
					aria-label={t("close")}
				>
					<X className="h-4 w-4" />
				</button>

				{/* Content */}
				<h3 className="pr-m-600 text-small font-semibold text-acc-100">
					{t(`${pageKey}.${step.titleKey}`)}
				</h3>
				<p className="mt-s-200 text-small text-txt-200">
					{t(`${pageKey}.${step.descriptionKey}`)}
				</p>
			</div>

			{/* Fixed navigation bar — always bottom-right so cursor stays in place */}
			<div
				className="fixed bottom-6 right-6 z-10 flex items-center gap-m-400 rounded-lg border border-acc-100/30 bg-bg-200 px-m-400 py-s-300 shadow-lg"
				onClick={(event) => event.stopPropagation()}
			>
				<span className="text-tiny text-txt-300">
					{currentStep} {t("stepOf")} {totalSteps}
				</span>
				<div className="flex items-center gap-s-200">
					{!isFirst && (
						<Button
							id="page-guide-prev"
							variant="ghost"
							size="sm"
							onClick={onPrev}
							aria-label={t("back")}
							className="h-8 px-s-200 text-txt-200 hover:text-txt-100"
						>
							<ChevronLeft className="mr-s-100 h-4 w-4" />
							{t("back")}
						</Button>
					)}
					<Button
						id="page-guide-next"
						variant="ghost"
						size="sm"
						onClick={isLast ? onClose : onNext}
						aria-label={isLast ? t("close") : t("next")}
						className="h-8 px-s-200 text-acc-100 hover:text-acc-100/80"
					>
						{isLast ? t("close") : t("next")}
						{!isLast && <ChevronRight className="ml-s-100 h-4 w-4" />}
					</Button>
				</div>
			</div>
		</div>
	)
}

/**
 * Computes CSS position for the callout card relative to the spotlight target.
 * Includes viewport boundary detection — if the preferred placement would push
 * the callout off-screen, it flips to the opposite side.
 */
const computeCalloutPosition = (
	preferredPlacement: GuideStep["placement"],
	targetRect: TargetRect | null,
	calloutEl: HTMLDivElement | null
): React.CSSProperties => {
	if (!targetRect) {
		return {
			top: "50%",
			left: "50%",
			transform: "translate(-50%, -50%)",
		}
	}

	const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024
	const viewportH = typeof window !== "undefined" ? window.innerHeight : 768
	const calloutH = calloutEl?.offsetHeight ?? CALLOUT_HEIGHT_ESTIMATE

	const centerX = targetRect.left + targetRect.width / 2

	const spaceBelow = viewportH - (targetRect.top + targetRect.height + SPOTLIGHT_PADDING + CALLOUT_GAP)
	const spaceAbove = targetRect.top - SPOTLIGHT_PADDING - CALLOUT_GAP
	const spaceRight = viewportW - (targetRect.left + targetRect.width + SPOTLIGHT_PADDING + CALLOUT_GAP)
	const spaceLeft = targetRect.left - SPOTLIGHT_PADDING - CALLOUT_GAP

	// Resolve actual placement — flip if preferred side doesn't have enough room
	const placement = (() => {
		if (preferredPlacement === "center") return "center"

		if (preferredPlacement === "bottom") {
			return spaceBelow >= calloutH ? "bottom" : "top"
		}
		if (preferredPlacement === "top") {
			return spaceAbove >= calloutH ? "top" : "bottom"
		}
		if (preferredPlacement === "right") {
			if (spaceRight >= CALLOUT_WIDTH) return "right"
			if (spaceLeft >= CALLOUT_WIDTH) return "left"
			return spaceBelow >= calloutH ? "bottom" : "top"
		}
		if (preferredPlacement === "left") {
			if (spaceLeft >= CALLOUT_WIDTH) return "left"
			if (spaceRight >= CALLOUT_WIDTH) return "right"
			return spaceBelow >= calloutH ? "bottom" : "top"
		}
		return preferredPlacement
	})()

	const clampLeft = (x: number) => Math.max(16, Math.min(x, viewportW - CALLOUT_WIDTH - 16))

	switch (placement) {
		case "bottom": {
			return {
				top: targetRect.top + targetRect.height + SPOTLIGHT_PADDING + CALLOUT_GAP,
				left: clampLeft(centerX - CALLOUT_WIDTH / 2),
			}
		}
		case "top": {
			const topVal = targetRect.top - SPOTLIGHT_PADDING - CALLOUT_GAP - calloutH
			return {
				top: Math.max(16, topVal),
				left: clampLeft(centerX - CALLOUT_WIDTH / 2),
			}
		}
		case "right": {
			const centerY = targetRect.top + targetRect.height / 2
			return {
				top: Math.max(16, Math.min(centerY - calloutH / 2, viewportH - calloutH - 16)),
				left: targetRect.left + targetRect.width + SPOTLIGHT_PADDING + CALLOUT_GAP,
			}
		}
		case "left": {
			const centerY = targetRect.top + targetRect.height / 2
			return {
				top: Math.max(16, Math.min(centerY - calloutH / 2, viewportH - calloutH - 16)),
				left: Math.max(16, targetRect.left - SPOTLIGHT_PADDING - CALLOUT_GAP - CALLOUT_WIDTH),
			}
		}
		case "center":
		default:
			return {
				top: "50%",
				left: "50%",
				transform: "translate(-50%, -50%)",
			}
	}
}

export { PageGuideOverlay }
