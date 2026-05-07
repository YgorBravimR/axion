"use client"

import {
	useState,
	useEffect,
	useRef,
	type ReactElement,
	type ComponentProps,
	type AriaRole,
} from "react"
import { ResponsiveContainer, Tooltip } from "recharts"

interface ChartContainerProps {
	"id": string
	"children": ReactElement
	"className"?: string
	"role"?: AriaRole
	"aria-label"?: string
	"suppressHydrationWarning"?: boolean
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
const ChartContainer = ({
	id,
	children,
	className,
	role,
	"aria-label": ariaLabel,
	suppressHydrationWarning,
}: ChartContainerProps) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const [dimensions, setDimensions] = useState<{
		width: number
		height: number
	} | null>(null)

	useEffect(() => {
		const el = containerRef.current
		if (!el) {
			return
		}

		const measure = () => {
			const { clientWidth, clientHeight } = el
			if (clientWidth > 0 && clientHeight > 0) {
				setDimensions((prev) => {
					if (prev?.width === clientWidth && prev?.height === clientHeight) {
						return prev
					}
					return { width: clientWidth, height: clientHeight }
				})
				return true
			}
			return false
		}

		// Check immediately — the element may already have dimensions
		if (measure()) {
			return
		}

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
		<div
			id={id}
			ref={containerRef}
			className={`overflow-hidden ${className ?? ""}`}
			role={role}
			aria-label={ariaLabel}
			suppressHydrationWarning={suppressHydrationWarning}
		>
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

/**
 * Theme-aware Recharts Tooltip with dark-mode cursor defaults.
 *
 * BarCharts use a filled rectangle cursor; line/area charts use a
 * subtle vertical stroke. Pass `variant` to pick the right one,
 * or override `cursor` directly when you need something custom.
 */
type ChartTooltipProps = ComponentProps<typeof Tooltip> & {
	variant?: "bar" | "line"
}

const BAR_CURSOR = { fill: "var(--color-bg-300)", opacity: 0.3 }
const LINE_CURSOR = { stroke: "var(--color-bg-300)", strokeWidth: 1 }

const ChartTooltip = ({
	variant = "bar",
	cursor,
	...rest
}: ChartTooltipProps) => {
	const defaultCursor = variant === "line" ? LINE_CURSOR : BAR_CURSOR
	return <Tooltip cursor={cursor ?? defaultCursor} {...rest} />
}

export { ChartContainer, ChartTooltip }
