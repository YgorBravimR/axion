import { useCallback, useRef, useEffect, useState } from "react"

/**
 * Hook for implementing roving tabindex pattern within a listbox container.
 * Manages focus movement between rows using ArrowUp/ArrowDown keys while
 * preserving Tab navigation to exit the container.
 *
 * Usage:
 * 1. Attach to the container (e.g., TradeDayGroup) with role="listbox"
 * 2. Each child row Link gets role="option" with tabindex managed by this hook
 * 3. Hook intercepts arrow keys and moves focus; Tab passes through
 * 4. Use focusedIndex to pass tabIndex prop to each row: tabIndex={index === focusedIndex ? 0 : -1}
 */
export const useRovingTabindex = () => {
	const containerRef = useRef<HTMLDivElement>(null)
	const [focusedIndex, setFocusedIndex] = useState(0)

	const getOptionElements = useCallback((): HTMLAnchorElement[] => {
		if (!containerRef.current) {
			return []
		}
		return Array.from(
			containerRef.current.querySelectorAll('[role="option"]')
		) as HTMLAnchorElement[]
	}, [])

	const focusRowByIndex = useCallback(
		(index: number) => {
			const options = getOptionElements()
			if (options.length === 0) {
				return
			}

			const clampedIndex = Math.max(0, Math.min(index, options.length - 1))
			setFocusedIndex(clampedIndex)
			options[clampedIndex]?.focus()
		},
		[getOptionElements]
	)

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (!containerRef.current?.contains(document.activeElement as Node)) {
				return
			}

			const options = getOptionElements()
			if (options.length === 0) {
				return
			}

			const currentIndex = options.indexOf(
				document.activeElement as HTMLAnchorElement
			)
			if (currentIndex === -1) {
				return
			}

			let newIndex: number | null = null

			switch (e.key) {
				case "ArrowDown":
					e.preventDefault()
					newIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0
					break
				case "ArrowUp":
					e.preventDefault()
					newIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1
					break
				case "Home":
					e.preventDefault()
					newIndex = 0
					break
				case "End":
					e.preventDefault()
					newIndex = options.length - 1
					break
				case "Enter":
				case " ":
					if (document.activeElement instanceof HTMLAnchorElement) {
						document.activeElement.click()
					}
					break
			}

			if (newIndex !== null) {
				focusRowByIndex(newIndex)
			}
		},
		[getOptionElements, focusRowByIndex]
	)

	useEffect(() => {
		const container = containerRef.current
		if (!container) {
			return
		}

		const options = getOptionElements()
		if (options.length === 0) {
			return
		}

		setFocusedIndex(0)
		container.addEventListener("keydown", handleKeyDown)

		return () => {
			container.removeEventListener("keydown", handleKeyDown)
		}
	}, [getOptionElements, handleKeyDown])

	return { containerRef, focusedIndex, focusRowByIndex }
}
