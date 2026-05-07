"use client"

import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	type ReactNode,
} from "react"
import type { PageGuideConfig } from "@/types/page-guide"
import { PageGuideOverlay } from "./page-guide-overlay"

interface PageGuideContextType {
	startGuide: (config: PageGuideConfig) => void
	registerGuide: (config: PageGuideConfig) => void
	unregisterGuide: () => void
	registeredConfig: PageGuideConfig | null
	isActive: boolean
	currentStep: number
	totalSteps: number
	next: () => void
	prev: () => void
	close: () => void
}

const PageGuideContext = createContext<PageGuideContextType | undefined>(
	undefined
)

const usePageGuide = () => {
	const context = useContext(PageGuideContext)
	if (!context) {
		throw new Error("usePageGuide must be used within PageGuideProvider")
	}
	return context
}

/**
 * Hook for pages to register their guide config on mount.
 * The header reads `registeredConfig` to show/hide the trigger button.
 *
 * Pass a stable reference (module-level const) — re-registers on identity change
 * so HMR module swaps and live config edits propagate without a full reload.
 */
const useRegisterPageGuide = (config: PageGuideConfig) => {
	const { registerGuide, unregisterGuide } = usePageGuide()

	useEffect(() => {
		registerGuide(config)
		return () => unregisterGuide()
	}, [config, registerGuide, unregisterGuide])
}

/**
 * Returns true when the element is in the DOM and actually visible
 * (not hidden by display:none, e.g. inside an inactive forceMount tab).
 */
const isElementVisible = (id: string): boolean => {
	const el = document.getElementById(id)
	if (!el) {
		return false
	}
	// offsetParent is null for display:none elements (and position:fixed, but those are still "visible")
	return el.offsetParent !== null || el.getClientRects().length > 0
}

/**
 * Scans the DOM for which guide steps have their target element present AND visible.
 * Returns an array of step indices that are visible (required steps always included).
 */
const computeVisibleIndices = (config: PageGuideConfig): number[] => {
	const indices: number[] = []
	for (let i = 0; i < config.steps.length; i++) {
		const step = config.steps[i]
		if (!step.optional || isElementVisible(step.targetId)) {
			indices.push(i)
		}
	}
	return indices
}

const PageGuideProvider = ({ children }: { children: ReactNode }) => {
	const [activeConfig, setActiveConfig] = useState<PageGuideConfig | null>(null)
	const [registeredConfig, setRegisteredConfig] =
		useState<PageGuideConfig | null>(null)
	const [currentStepIndex, setCurrentStepIndex] = useState(0)
	const [visibleIndices, setVisibleIndices] = useState<number[]>([])
	const previousFocusRef = useRef<HTMLElement | null>(null)

	const isActive = activeConfig !== null

	const registerGuide = useCallback((config: PageGuideConfig) => {
		setRegisteredConfig(config)
	}, [])

	const unregisterGuide = useCallback(() => {
		setRegisteredConfig(null)
		setActiveConfig(null)
		setCurrentStepIndex(0)
		setVisibleIndices([])
	}, [])

	// Recompute visible step indices after each render when the guide is active.
	// Runs in useEffect (post-commit) so getElementById reads the committed DOM.
	useEffect(() => {
		if (!activeConfig) {
			setVisibleIndices([])
			return
		}

		// Use requestAnimationFrame to ensure the DOM is fully painted
		const rafId = requestAnimationFrame(() => {
			const indices = computeVisibleIndices(activeConfig)
			setVisibleIndices(indices)
		})

		return () => cancelAnimationFrame(rafId)
	}, [activeConfig, currentStepIndex])

	// Fire each step's onEnter side-effect exactly once when entering it.
	const enteredStepRef = useRef<number | null>(null)
	useEffect(() => {
		if (!activeConfig) {
			enteredStepRef.current = null
			return
		}
		if (enteredStepRef.current === currentStepIndex) {
			return
		}
		enteredStepRef.current = currentStepIndex
		activeConfig.steps[currentStepIndex]?.onEnter?.()
	}, [activeConfig, currentStepIndex])

	const startGuide = useCallback((config: PageGuideConfig) => {
		previousFocusRef.current = document.activeElement as HTMLElement | null

		// Scroll the first visible step's target into view before starting
		const indices = computeVisibleIndices(config)
		if (indices.length === 0) {
			return
		}

		const firstTargetId = config.steps[indices[0]].targetId
		const firstTarget = document.getElementById(firstTargetId)

		if (firstTarget) {
			firstTarget.scrollIntoView({ behavior: "smooth", block: "center" })
		} else {
			// Fallback: scroll to top
			const scrollArea = document.querySelector(
				"[data-radix-scroll-area-viewport]"
			)
			if (scrollArea) {
				scrollArea.scrollTo({ top: 0, behavior: "smooth" })
			} else {
				window.scrollTo({ top: 0, behavior: "smooth" })
			}
		}

		// Wait for scroll to settle, then start
		setTimeout(() => {
			const freshIndices = computeVisibleIndices(config)
			if (freshIndices.length === 0) {
				return
			}
			setVisibleIndices(freshIndices)
			setActiveConfig(config)
			setCurrentStepIndex(freshIndices[0])
		}, 400)
	}, [])

	const close = useCallback(() => {
		setActiveConfig(null)
		setCurrentStepIndex(0)
		setVisibleIndices([])
		if (previousFocusRef.current) {
			previousFocusRef.current.focus()
			previousFocusRef.current = null
		}
	}, [])

	const next = useCallback(() => {
		if (!activeConfig) {
			return
		}

		// Re-scan DOM at event time (post-commit, safe to call getElementById here)
		const freshIndices = computeVisibleIndices(activeConfig)
		const currentPos = freshIndices.indexOf(currentStepIndex)

		if (currentPos < freshIndices.length - 1) {
			const nextIdx = freshIndices[currentPos + 1]
			setCurrentStepIndex(nextIdx)
			setVisibleIndices(freshIndices)
		} else {
			close()
		}
	}, [activeConfig, currentStepIndex, close])

	const prev = useCallback(() => {
		if (!activeConfig) {
			return
		}

		const freshIndices = computeVisibleIndices(activeConfig)
		const currentPos = freshIndices.indexOf(currentStepIndex)

		if (currentPos > 0) {
			const prevIdx = freshIndices[currentPos - 1]
			setCurrentStepIndex(prevIdx)
			setVisibleIndices(freshIndices)
		}
	}, [activeConfig, currentStepIndex])

	useEffect(() => {
		if (!isActive) {
			return
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault()
				close()
			} else if (event.key === "ArrowRight") {
				event.preventDefault()
				next()
			} else if (event.key === "ArrowLeft") {
				event.preventDefault()
				prev()
			}
		}

		document.addEventListener("keydown", handleKeyDown, true)
		return () => document.removeEventListener("keydown", handleKeyDown, true)
	}, [isActive, close, next, prev])

	// Derive the human-readable step number from the visible indices
	const positionInVisible = visibleIndices.indexOf(currentStepIndex)
	const currentStepNumber = positionInVisible >= 0 ? positionInVisible + 1 : 1
	const totalSteps = visibleIndices.length

	const contextValue = useMemo(
		() => ({
			startGuide,
			registerGuide,
			unregisterGuide,
			registeredConfig,
			isActive,
			currentStep: currentStepNumber,
			totalSteps,
			next,
			prev,
			close,
		}),
		[
			startGuide,
			registerGuide,
			unregisterGuide,
			registeredConfig,
			isActive,
			currentStepNumber,
			totalSteps,
			next,
			prev,
			close,
		]
	)

	return (
		<PageGuideContext.Provider value={contextValue}>
			{children}
			{isActive && activeConfig && (
				<PageGuideOverlay
					step={activeConfig.steps[currentStepIndex]}
					pageKey={activeConfig.pageKey}
					currentStep={currentStepNumber}
					totalSteps={totalSteps}
					onNext={next}
					onPrev={prev}
					onClose={close}
				/>
			)}
		</PageGuideContext.Provider>
	)
}

export { PageGuideProvider, usePageGuide, useRegisterPageGuide }
