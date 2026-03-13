"use client"

import { useState, useEffect, type ReactElement } from "react"
import { ResponsiveContainer } from "recharts"

interface ChartContainerProps {
	id: string
	children: ReactElement
	className?: string
}

/**
 * Wrapper around Recharts' ResponsiveContainer that prevents the
 * "width(-1) and height(-1)" SSR warning by deferring chart rendering
 * until after mount, when the browser can actually measure the container.
 *
 * Replaces the pattern:
 *   <div className="h-64"><ResponsiveContainer ...>{chart}</ResponsiveContainer></div>
 * With:
 *   <ChartContainer className="h-64">{chart}</ChartContainer>
 */
const ChartContainer = ({ id, children, className }: ChartContainerProps) => {
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	if (!mounted) {
		return <div id={id} className={className} />
	}

	return (
		<div id={id} className={`overflow-hidden ${className ?? ""}`}>
			<ResponsiveContainer
				width="100%"
				height="100%"
				minWidth={0}
				minHeight={0}
			>
				{children}
			</ResponsiveContainer>
		</div>
	)
}

export { ChartContainer }
