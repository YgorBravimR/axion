"use client"

import { useEffect } from "react"

interface UseEnrichShortcutsOptions {
	onNext: () => void
	onPrev: () => void
	onSave: () => void
	onSkip: () => void
	onAcceptAll: () => void
	onRejectAll: () => void
	onEdit: () => void
	onHelp: () => void
	enabled?: boolean
}

/**
 * Hook to manage keyboard shortcuts for the enrichment review UI.
 * Listens for j/k/enter/s/a/r/e/? keys and calls appropriate handlers.
 * Ignores input fields, textareas, and modifier keys.
 */
export const useEnrichShortcuts = (
	options: UseEnrichShortcutsOptions
): void => {
	const {
		onNext,
		onPrev,
		onSave,
		onSkip,
		onAcceptAll,
		onRejectAll,
		onEdit,
		onHelp,
		enabled = true,
	} = options

	useEffect(() => {
		if (!enabled) {
			return
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			// Ignore if a modifier key is held
			if (event.metaKey || event.ctrlKey || event.altKey) {
				return
			}

			// Ignore if typing in an input field
			const target = event.target as HTMLElement
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement ||
				target.contentEditable === "true"
			) {
				return
			}

			const key = event.key.toLowerCase()

			switch (key) {
				case "j":
				case "arrowdown":
					event.preventDefault()
					onNext()
					break
				case "k":
				case "arrowup":
					event.preventDefault()
					onPrev()
					break
				case "enter":
					event.preventDefault()
					onSave()
					break
				case "s":
					event.preventDefault()
					onSkip()
					break
				case "a":
					event.preventDefault()
					onAcceptAll()
					break
				case "r":
					event.preventDefault()
					onRejectAll()
					break
				case "e":
					event.preventDefault()
					onEdit()
					break
				case "?":
					event.preventDefault()
					onHelp()
					break
			}
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => {
			document.removeEventListener("keydown", handleKeyDown)
		}
	}, [
		enabled,
		onNext,
		onPrev,
		onSave,
		onSkip,
		onAcceptAll,
		onRejectAll,
		onEdit,
		onHelp,
	])
}
