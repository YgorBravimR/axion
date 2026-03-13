"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"

// ==========================================
// Types
// ==========================================

interface LoadingOverlayOptions {
	message: string
	progress?: number
	subMessage?: string
}

interface LoadingOverlayContextType {
	showLoading: (options: LoadingOverlayOptions) => void
	updateLoading: (options: Partial<LoadingOverlayOptions>) => void
	hideLoading: () => void
	isLoading: boolean
}

// ==========================================
// Context
// ==========================================

const LoadingOverlayContext = createContext<LoadingOverlayContextType | undefined>(undefined)

const useLoadingOverlay = () => {
	const context = useContext(LoadingOverlayContext)
	if (!context) {
		throw new Error("useLoadingOverlay must be used within LoadingOverlayProvider")
	}
	return context
}

// ==========================================
// Provider
// ==========================================

const LoadingOverlayProvider = ({ children }: { children: React.ReactNode }) => {
	const [options, setOptions] = useState<LoadingOverlayOptions | null>(null)
	const overlayRef = useRef<HTMLDivElement>(null)
	const previousFocusRef = useRef<HTMLElement | null>(null)

	const isLoading = options !== null

	const showLoading = useCallback((newOptions: LoadingOverlayOptions) => {
		previousFocusRef.current = document.activeElement as HTMLElement | null
		setOptions(newOptions)
	}, [])

	const updateLoading = useCallback((updates: Partial<LoadingOverlayOptions>) => {
		setOptions((prev) => {
			if (!prev) return prev
			return { ...prev, ...updates }
		})
	}, [])

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
		if (!isLoading) return

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

	return (
		<LoadingOverlayContext.Provider value={{ showLoading, updateLoading, hideLoading, isLoading }}>
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
					className="fixed inset-0 z-50 flex items-center justify-center bg-bg-100/90 backdrop-blur-sm animate-overlay-fade-in outline-none"
				>
					<div className="flex flex-col items-center gap-m-600">
						{/* Pulsing golden line */}
						<div
							className="h-[2px] rounded-full bg-acc-100 animate-overlay-pulse-line"
							aria-hidden="true"
						/>

						{/* Message */}
						<p className="text-body font-medium text-txt-100 text-center">
							{options.message}
						</p>

						{/* Sub-message */}
						{options.subMessage && (
							<p className="text-small text-txt-300 text-center -mt-m-400">
								{options.subMessage}
							</p>
						)}

						{/* Progress bar */}
						{options.progress !== undefined && (
							<div className="w-64 space-y-s-200">
								<div className="h-1.5 overflow-hidden rounded-full bg-bg-300">
									<div
										className="relative h-full rounded-full bg-acc-100 transition-all duration-300"
										style={{ width: `${Math.min(options.progress, 100)}%` }}
									>
										{/* Shimmer effect */}
										<div
											className="absolute inset-0 bg-linear-to-r from-transparent via-white/25 to-transparent animate-overlay-progress-shimmer"
											aria-hidden="true"
										/>
									</div>
								</div>
								<p className="text-center text-tiny text-txt-300">
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
