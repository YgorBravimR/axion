"use client"

import type { ReactNode } from "react"
import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
	useRef,
	useMemo,
} from "react"

// ==========================================
// Types
// ==========================================

interface LoadingOverlayOptions {
	message: string
	progress?: number
	subMessage?: string
}

interface LoadingOverlayContextType {
	showLoading: (_options: LoadingOverlayOptions) => void
	updateLoading: (_options: Partial<LoadingOverlayOptions>) => void
	hideLoading: () => void
	isLoading: boolean
}

// ==========================================
// Context
// ==========================================

const LoadingOverlayContext = createContext<
	LoadingOverlayContextType | undefined
>(undefined)

const useLoadingOverlay = () => {
	const context = useContext(LoadingOverlayContext)
	if (!context) {
		throw new Error(
			"useLoadingOverlay must be used within LoadingOverlayProvider"
		)
	}
	return context
}

// ==========================================
// Provider
// ==========================================

const LoadingOverlayProvider = ({ children }: { children: ReactNode }) => {
	const [options, setOptions] = useState<LoadingOverlayOptions | null>(null)
	const overlayRef = useRef<HTMLDivElement>(null)
	const previousFocusRef = useRef<HTMLElement | null>(null)

	const isLoading = options !== null

	const showLoading = useCallback((newOptions: LoadingOverlayOptions) => {
		previousFocusRef.current = document.activeElement as HTMLElement | null
		setOptions(newOptions)
	}, [])

	const updateLoading = useCallback(
		(updates: Partial<LoadingOverlayOptions>) => {
			setOptions((prev) => {
				if (!prev) {
					return prev
				}
				return { ...prev, ...updates }
			})
		},
		[]
	)

	const hideLoading = useCallback(() => {
		setOptions(null)
		// Restore focus to the element that was focused before the overlay appeared
		if (previousFocusRef.current) {
			previousFocusRef.current.focus()
			previousFocusRef.current = null
		}
	}, [])

	// Focus trap: move focus to overlay on mount
	useEffect(() => {
		if (isLoading && overlayRef.current) {
			overlayRef.current.focus()
		}
	}, [isLoading])

	// Trap keyboard events while overlay is visible
	useEffect(() => {
		if (!isLoading) {
			return
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			// Prevent tab navigation and most keyboard interactions
			if (e.key === "Tab" || e.key === "Escape") {
				e.preventDefault()
				e.stopPropagation()
			}
		}

		document.addEventListener("keydown", handleKeyDown, true)
		return () => document.removeEventListener("keydown", handleKeyDown, true)
	}, [isLoading])

	const contextValue = useMemo(
		() => ({ showLoading, updateLoading, hideLoading, isLoading }),
		[showLoading, updateLoading, hideLoading, isLoading]
	)

	return (
		<LoadingOverlayContext.Provider value={contextValue}>
			{children}

			{/* Overlay */}
			{isLoading && options && (
				<div
					ref={overlayRef}
					role="alertdialog"
					aria-modal="true"
					aria-busy="true"
					aria-live="assertive"
					aria-label={options.message}
					tabIndex={-1}
					className="bg-bg-100/90 animate-overlay-fade-in fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm outline-none"
				>
					<div className="gap-m-600 flex flex-col items-center">
						{/* Pulsing golden line */}
						<div
							className="bg-acc-100 animate-overlay-pulse-line h-[2px] rounded-full"
							aria-hidden="true"
						/>

						{/* Message */}
						<p className="text-body text-txt-100 text-center font-medium">
							{options.message}
						</p>

						{/* Sub-message */}
						{options.subMessage && (
							<p className="text-small text-txt-300 -mt-m-400 text-center">
								{options.subMessage}
							</p>
						)}

						{/* Progress bar */}
						{options.progress !== undefined && (
							<div className="space-y-s-200 w-64">
								<div className="bg-bg-300 h-1.5 overflow-hidden rounded-full">
									<div
										className="bg-acc-100 relative h-full rounded-full transition-all duration-300"
										style={{ width: `${Math.min(options.progress, 100)}%` }}
									>
										{/* Shimmer effect */}
										<div
											className="animate-overlay-progress-shimmer absolute inset-0 bg-linear-to-r from-transparent via-white/25 to-transparent"
											aria-hidden="true"
										/>
									</div>
								</div>
								<p className="text-tiny text-txt-300 text-center">
									{Math.round(options.progress)}%
								</p>
							</div>
						)}
					</div>
				</div>
			)}
		</LoadingOverlayContext.Provider>
	)
}

export { LoadingOverlayProvider, useLoadingOverlay }
export type { LoadingOverlayOptions, LoadingOverlayContextType }
