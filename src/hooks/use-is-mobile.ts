import { useState, useEffect } from "react"

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024

type Breakpoint = "mobile" | "tablet" | "desktop"

/**
 * Returns the current responsive breakpoint tier.
 *
 * - "mobile"  → < 768px (sheet sidebar)
 * - "tablet"  → 768px–1023px (collapsed sidebar)
 * - "desktop" → ≥ 1024px (full sidebar)
 *
 * Defaults to "desktop" during SSR and on initial client render so the
 * server-rendered HTML always matches the first client paint (no hydration
 * mismatch). The auth-gate / loading overlays hide the brief desktop-first
 * flash on smaller devices.
 */
const useBreakpoint = (): Breakpoint => {
	const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop")

	useEffect(() => {
		const mobileMql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
		const tabletMql = window.matchMedia(
			`(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${TABLET_BREAKPOINT - 1}px)`
		)

		const handleChange = () => {
			if (mobileMql.matches) {
				setBreakpoint("mobile")
			} else if (tabletMql.matches) {
				setBreakpoint("tablet")
			} else {
				setBreakpoint("desktop")
			}
		}

		handleChange()

		mobileMql.addEventListener("change", handleChange)
		tabletMql.addEventListener("change", handleChange)
		return () => {
			mobileMql.removeEventListener("change", handleChange)
			tabletMql.removeEventListener("change", handleChange)
		}
	}, [])

	return breakpoint
}

/**
 * Returns `true` when the viewport is below the `md` breakpoint (768px).
 * Kept for backward compatibility with components that only need a boolean check.
 */
const useIsMobile = (): boolean => {
	const breakpoint = useBreakpoint()
	return breakpoint === "mobile"
}

export { useIsMobile, useBreakpoint, type Breakpoint }
