"use client"

import type { RefObject, ReactNode } from "react"
import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
	useRef,
	useMemo,
} from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { getAccountTypeBrand, getAccountIcon } from "@/lib/account-brand"

// ==========================================
// Types
// ==========================================

interface AccountTransitionOptions {
	accountName: string
	accountType: "personal" | "prop" | "replay"
}

interface AccountTransitionContextType {
	showAccountTransition: (
		_options: AccountTransitionOptions & {
			onTransition: () => Promise<void>
		}
	) => void
	isTransitioning: boolean
}

type TransitionPhase = "idle" | "entering" | "active" | "expanding"

// ==========================================
// Constants
// ==========================================

const TRANSITION_SESSION_KEY = "account-transition"

// ==========================================
// Context
// ==========================================

const AccountTransitionContext = createContext<
	AccountTransitionContextType | undefined
>(undefined)

const useAccountTransition = (): AccountTransitionContextType => {
	const context = useContext(AccountTransitionContext)
	if (!context) {
		throw new Error(
			"useAccountTransition must be used within AccountTransitionOverlayProvider"
		)
	}
	return context
}

// ==========================================
// Helpers
// ==========================================

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms))

// ==========================================
// Resumed Overlay (post-reload)
// ==========================================

/**
 * Solid overlay that persists across the hard reload during account switch.
 * Hides the skeleton/loading state while the new page hydrates, then fades out.
 */
const ResumedOverlay = () => {
	const [isVisible, setIsVisible] = useState(false)
	const [isMounted, setIsMounted] = useState(false)

	useEffect(() => {
		// Check for resumed transition on client only
		try {
			const flag = sessionStorage.getItem(TRANSITION_SESSION_KEY)
			if (flag) {
				sessionStorage.removeItem(TRANSITION_SESSION_KEY)
				setIsVisible(true)
			}
		} catch {
			// sessionStorage unavailable
		}
		setIsMounted(true)
	}, [])

	useEffect(() => {
		if (!isVisible) {
			return
		}
		// Allow content to load under the overlay, then fade out
		const fadeTimer = setTimeout(() => setIsVisible(false), 800)
		return () => clearTimeout(fadeTimer)
	}, [isVisible])

	if (!isMounted || !isVisible) {
		return null
	}

	return (
		<div
			aria-hidden="true"
			className="bg-bg-100 animate-overlay-fade-out fixed inset-0 z-50"
		/>
	)
}

// ==========================================
// Transition Overlay Content
// ==========================================

interface TransitionOverlayProps {
	options: AccountTransitionOptions
	phase: TransitionPhase
	overlayRef: RefObject<HTMLDivElement | null>
	getAccountTypeLabel: (_accountType: string) => string
	transitionLabel: string
	switchingToLabel: string
}

/**
 * Full-screen overlay shown during account transition.
 * Displays a video, pulsing ring, and account info while the switch completes.
 */
const TransitionOverlay = ({
	options,
	phase,
	overlayRef,
	getAccountTypeLabel,
	transitionLabel,
	switchingToLabel,
}: TransitionOverlayProps) => {
	const AccountIcon = getAccountIcon(options.accountType)
	const isExpanding = phase === "expanding"

	return (
		<div
			ref={overlayRef}
			role="alertdialog"
			aria-modal="true"
			aria-busy="true"
			aria-label={transitionLabel}
			tabIndex={-1}
			className="bg-bg-100 animate-overlay-fade-in fixed inset-0 z-50 flex items-center justify-center outline-none"
		>
			<div className="gap-m-600 flex flex-col items-center">
				{/* Video with gold gradient ring -- expands at the end */}
				<div
					className={
						isExpanding
							? "will-change-transform-opacity animate-transition-video-expand relative"
							: "animate-transition-scale-in relative"
					}
				>
					{/* Pulsing gold ring */}
					<div
						className="from-brand-400 via-acc-100 to-brand-600 animate-transition-ring-pulse absolute -inset-3 rounded-full bg-linear-to-br"
						aria-hidden="true"
					/>

					{/* Brand mark */}
					<div className="bg-bg-100 relative flex h-60 w-60 items-center justify-center overflow-hidden rounded-full">
						<Image
							src="/bravo-mark-gold-nobg.png"
							alt=""
							width={144}
							height={144}
							className="h-36 w-36 object-contain"
						/>
					</div>
				</div>

				{/* Gold pulse line divider -- fade wrapper avoids dual-animation conflict */}
				<div className={isExpanding ? "animate-transition-content-fade" : ""}>
					<div
						className="bg-acc-100 animate-overlay-pulse-line h-0.5 w-20 rounded-full"
						aria-hidden="true"
					/>
				</div>

				{/* Text content -- fade wrapper keeps fade separate from text-up animation */}
				<div className={isExpanding ? "animate-transition-content-fade" : ""}>
					<div className="gap-s-200 flex flex-col items-center">
						<p className="text-small text-txt-300 animate-transition-text-up">
							{switchingToLabel}
						</p>
						<p className="text-h3 text-acc-100 animate-transition-text-up animation-delay-100 font-semibold">
							{options.accountName}
						</p>
						<div className="gap-s-200 text-small text-txt-300 animate-transition-text-up animation-delay-200 flex items-center">
							<AccountIcon className="h-4 w-4" aria-hidden="true" />
							<span>{getAccountTypeLabel(options.accountType)}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

// ==========================================
// Provider
// ==========================================

const AccountTransitionOverlayProvider = ({
	children,
}: {
	children: ReactNode
}) => {
	const t = useTranslations("auth.accountSwitcher")
	const [phase, setPhase] = useState<TransitionPhase>("idle")
	const [options, setOptions] = useState<AccountTransitionOptions | null>(null)
	const overlayRef = useRef<HTMLDivElement>(null)
	const previousFocusRef = useRef<HTMLElement | null>(null)

	const isTransitioning = phase !== "idle"

	const showAccountTransition = useCallback(
		(
			transitionOptions: AccountTransitionOptions & {
				onTransition: () => Promise<void>
			}
		) => {
			if (isTransitioning) {
				return
			}

			previousFocusRef.current = document.activeElement as HTMLElement | null
			setOptions({
				accountName: transitionOptions.accountName,
				accountType: transitionOptions.accountType,
			})
			setPhase("entering")

			// 300ms enter + 1800ms active + 500ms expand, then hard reload
			setTimeout(() => {
				void (async () => {
					setPhase("active")

					const minimumDelay = sleep(1800)

					try {
						await Promise.all([transitionOptions.onTransition(), minimumDelay])
					} catch {
						// On error, still proceed to reload
					}

					// Video grows into screen, text fades out — overlay stays solid bg-bg-100
					setPhase("expanding")
					await sleep(500)

					// Pre-set the target brand before reload so the new page renders correctly
					const targetBrand = getAccountTypeBrand(transitionOptions.accountType)
					try {
						localStorage.setItem("brand", targetBrand)
					} catch {
						// localStorage unavailable
					}
					document.documentElement.setAttribute("data-brand", targetBrand)

					// Signal the resumed overlay to show on the new page
					try {
						sessionStorage.setItem(TRANSITION_SESSION_KEY, "1")
					} catch {
						// sessionStorage unavailable
					}

					window.location.reload()
				})()
			}, 300)
		},
		[isTransitioning]
	)

	// Focus trap: move focus to overlay on mount
	useEffect(() => {
		if (isTransitioning && overlayRef.current) {
			overlayRef.current.focus()
		}
	}, [isTransitioning])

	// Trap keyboard events while overlay is visible
	useEffect(() => {
		if (!isTransitioning) {
			return
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Tab" || e.key === "Escape") {
				e.preventDefault()
				e.stopPropagation()
			}
		}

		document.addEventListener("keydown", handleKeyDown, true)
		return () => document.removeEventListener("keydown", handleKeyDown, true)
	}, [isTransitioning])

	const getAccountTypeLabel = useCallback(
		(accountType: string): string => {
			switch (accountType) {
				case "prop":
					return t("propFirm")
				case "replay":
					return t("replay")
				default:
					return t("personal")
			}
		},
		[t]
	)

	const contextValue = useMemo(
		() => ({ showAccountTransition, isTransitioning }),
		[showAccountTransition, isTransitioning]
	)

	return (
		<AccountTransitionContext.Provider value={contextValue}>
			{children}

			{/* Resumed overlay: solid bg that fades out after reload */}
			<ResumedOverlay />

			{/* Transition Overlay */}
			{isTransitioning && options ? (
				<TransitionOverlay
					options={options}
					phase={phase}
					overlayRef={overlayRef}
					getAccountTypeLabel={getAccountTypeLabel}
					transitionLabel={t("transitionLabel", { name: options.accountName })}
					switchingToLabel={t("switchingTo")}
				/>
			) : null}
		</AccountTransitionContext.Provider>
	)
}

export { AccountTransitionOverlayProvider, useAccountTransition }
export type { AccountTransitionOptions, AccountTransitionContextType }
