"use client"

import { Fragment, type ReactNode } from "react"
import {
	useAccountMode,
	type AccountModeValue,
} from "@/components/providers/account-mode-provider"

// Variant map is keyed by every non-`default` mode. Excluding `"default"` here
// is the type-level guarantee that the fallback always lives in the `default`
// prop — there is no "default in the map and also a sibling default" ambiguity.
type MethodologyVariantKey = Exclude<AccountModeValue, "default">

interface ModeVariantProps {
	default: ReactNode
	variants?: Partial<Record<MethodologyVariantKey, ReactNode>>
}

/**
 * Declarative mode-aware swap: renders the variant matching the active account
 * mode, or `default` when the active mode has no variant entry.
 *
 * Adding a new methodology (e.g. ORB) only requires extending `AccountModeValue`
 * in the provider — every existing `ModeVariant` call site keeps compiling.
 *
 * Example:
 *   <ModeVariant
 *     default={<CoachingCard />}
 *     variants={{ hawks: <HawksCoachingCard /> }}
 *   />
 */
const ModeVariant = ({
	default: defaultVariant,
	variants,
}: ModeVariantProps) => {
	const { mode } = useAccountMode()
	if (mode !== "default" && variants) {
		const variant = variants[mode]
		if (variant !== undefined) {
			return <Fragment>{variant}</Fragment>
		}
	}
	return <Fragment>{defaultVariant}</Fragment>
}

export { ModeVariant, type ModeVariantProps, type MethodologyVariantKey }
