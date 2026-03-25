"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { getUserTheme } from "@/app/actions/settings"

/**
 * Synchronizes the user's persisted theme preference (from DB) with next-themes.
 * Runs once on mount in authenticated layouts to apply the user's saved choice.
 */
export const ThemeSynchronizer = () => {
	const { setTheme } = useTheme()
	const hasSynced = useRef(false)

	useEffect(() => {
		if (hasSynced.current) return
		hasSynced.current = true

		const syncTheme = async () => {
			try {
				const result = await getUserTheme()
				if (result.status === "success" && result.data) {
					setTheme(result.data)
				}
			} catch {
				// Theme sync failed — user keeps the default theme
			}
		}

		syncTheme()
	}, [setTheme])

	return null
}
