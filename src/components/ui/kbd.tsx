"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface KbdProps {
	keys: string[]
	className?: string
}

const Kbd = ({ keys, className }: KbdProps) => {
	const [isMac, setIsMac] = useState(true)

	useEffect(() => {
		setIsMac(navigator.platform.toUpperCase().includes("MAC"))
	}, [])

	const displayKeys = keys.map((key) => {
		if (key === "mod") {
			return isMac ? "\u2318" : "Ctrl"
		}
		return key
	})

	return (
		<kbd
			className={cn(
				"bg-bg-300 text-txt-300 border-bg-300 text-tiny inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono",
				className
			)}
		>
			{displayKeys.map((key, index) => (
				<span key={index}>{key}</span>
			))}
		</kbd>
	)
}

export { Kbd }
