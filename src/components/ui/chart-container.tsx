"use client"

import { useState, useEffect, useRef, type ReactElement } from "react"
import { ResponsiveContainer } from "recharts"

interface ChartContainerProps {
	id: string
	children: ReactElement
	className?: string
}

/**
 * Wrapper around Recharts' ResponsiveContainer that prevents the
 * "width(-1) and height(-1)" warning.
 *
 * Root cause: ResponsiveContainer initializes internal state with
 * { width: -1, height: -1 } and emits a warning on its very first
 * render before its own ResizeObserver fires. We solve this by:
 *   1. Deferring render until our container has real dimensions
 *   2. Passing those dimensions as `initialDimension` so RC never
 *      sees -1 values, even on its first render cycle.
 */
const ChartContainer = ({ id, children, className }: ChartContainerProps) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)

	useEffect(() => {
		const el = containerRef.current
		if (!el) return

		const measure = () => {
			const { clientWidth, clientHeight } = el
			if (clientWidth > 0 && clientHeight > 0) {
				setDimensions({ width: clientWidth, height: clientHeight })
				return true
			}
			return false
		}

		// Check immediately — the element may already have dimensions
		if (measure()) return

		// Otherwise wait for layout via ResizeObserver
		const observer = new ResizeObserver(() => {
			if (measure()) {
				observer.disconnect()
			}
		})

		observer.observe(el)

		return () => observer.disconnect()
	}, [])

	return (
		<div id={id} ref={containerRef} className={`overflow-hidden ${className ?? ""}`}>
			{dimensions && (
				<ResponsiveContainer
					width="100%"
					height="100%"
					initialDimension={dimensions}
					minWidth={0}
					minHeight={0}
				>
					{children}
				</ResponsiveContainer>
			)}
		</div>
	)
}

export { ChartContainer }
