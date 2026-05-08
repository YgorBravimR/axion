"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useUrlParams } from "./use-url-params"

interface UseDebouncedSearchReturn {
	/** Current local value for the input (immediate feedback) */
	value: string
	/** Update local value — syncs to URL after debounce */
	setValue: (_value: string) => void
	/** Clear the search immediately (removes URL param) */
	clear: () => void
}

/**
 * Provides a local state for immediate input feedback,
 * then syncs to URL search params after a debounce delay.
 *
 * @param paramKey - The URL param key to sync with (e.g. "assetQ")
 * @param delay - Debounce delay in ms (default: 500)
 */
const useDebouncedSearch = (
	paramKey: string,
	delay = 500
): UseDebouncedSearchReturn => {
	const urlParams = useUrlParams()
	const urlValue = urlParams.get(paramKey) ?? ""
	const [value, setValue] = useState(urlValue)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Sync local state when URL param changes externally (e.g. browser back)
	useEffect(() => {
		setValue(urlValue)
	}, [urlValue])

	// Debounce: sync local value to URL
	useEffect(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current)
		}

		timerRef.current = setTimeout(() => {
			if (value !== urlValue) {
				urlParams.set({ [paramKey]: value || null })
			}
		}, delay)

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current)
			}
		}
	}, [value, delay, urlValue, paramKey, urlParams])

	const clear = useCallback(() => {
		setValue("")
		if (timerRef.current) {
			clearTimeout(timerRef.current)
		}
		urlParams.set({ [paramKey]: null })
	}, [paramKey, urlParams])

	return { value, setValue, clear }
}

export { useDebouncedSearch }
