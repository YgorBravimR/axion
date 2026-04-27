"use client"

import { useTheme } from "next-themes"
import { useEffect, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { updateTheme } from "@/app/actions/settings"

export const ThemeToggle = () => {
	const { theme, setTheme } = useTheme()
	const t = useTranslations("settings.profile")
	const [mounted, setMounted] = useState(false)
	const [, startTransition] = useTransition()

	useEffect(() => {
		setMounted(true)
	}, [])

	if (!mounted) {
		return null
	}

	const handleToggle = () => {
		const newTheme = theme === "dark" ? "light" : "dark"
		setTheme(newTheme)
		// Persist to DB in background — non-blocking
		startTransition(async () => {
			await updateTheme(newTheme)
		})
	}

	return (
		<Button
			id="theme-toggle"
			type="button"
			variant="outline"
			size="sm"
			onClick={handleToggle}
			aria-label={theme === "dark" ? t("lightMode") : t("darkMode")}
		>
			{theme === "dark" ? (
				<>
					<Sun className="mr-s-200 h-4 w-4" aria-hidden="true" />
					{t("lightMode")}
				</>
			) : (
				<>
					<Moon className="mr-s-200 h-4 w-4" aria-hidden="true" />
					{t("darkMode")}
				</>
			)}
		</Button>
	)
}
