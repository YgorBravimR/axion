"use client"

import { Fragment, type ReactNode } from "react"
import { useAccountMode } from "@/components/providers/account-mode-provider"

interface ModeVariantProps {
	default?: ReactNode
	hawks?: ReactNode
}

/**
 * Declarative mode-aware swap: renders the variant matching the active account mode.
 * Falls back to `default` (or null) if the active mode has no explicit variant.
 *
 * Example:
 *   <ModeVariant default={<CoachingCard />} hawks={<HawksCoachingCard />} />
 */
const ModeVariant = ({ default: defaultVariant, hawks }: ModeVariantProps) => {
	const { mode } = useAccountMode()
	if (mode === "hawks" && hawks !== undefined) {
		return <Fragment>{hawks}</Fragment>
	}
	return <Fragment>{defaultVariant ?? null}</Fragment>
}

export { ModeVariant, type ModeVariantProps }
