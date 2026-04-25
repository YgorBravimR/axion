"use client"

import {
	createContext,
	useContext,
	useState,
	type ReactNode,
	type Dispatch,
	type SetStateAction,
} from "react"
import type { MCCalibrationSnapshot } from "@/types/mc-calibration"

// ==========================================
// CONTEXTS
// ==========================================

const MCCalibrationStateContext = createContext<
	MCCalibrationSnapshot | null | undefined
>(undefined)
const MCCalibrationDispatchContext = createContext<
	Dispatch<SetStateAction<MCCalibrationSnapshot | null>> | undefined
>(undefined)

// ==========================================
// PROVIDER
// ==========================================

interface MCCalibrationProviderProps {
	children: ReactNode
}

/**
 * Provides a lightweight in-memory bridge for Monte Carlo calibration data.
 * When a user runs a Monte Carlo simulation, the snapshot is stored here.
 * Equity Shield can then read it to suggest parameter values.
 *
 * Split into two contexts so dispatch-only consumers (MC content) don't
 * re-render when the snapshot changes.
 *
 * Ephemeral by design: survives SPA navigation, lost on hard refresh.
 * This is intentional — stale calibration from yesterday shouldn't silently influence today.
 */
const MCCalibrationProvider = ({ children }: MCCalibrationProviderProps) => {
	const [snapshot, setSnapshot] = useState<MCCalibrationSnapshot | null>(null)

	return (
		<MCCalibrationDispatchContext.Provider value={setSnapshot}>
			<MCCalibrationStateContext.Provider value={snapshot}>
				{children}
			</MCCalibrationStateContext.Provider>
		</MCCalibrationDispatchContext.Provider>
	)
}

// ==========================================
// HOOKS
// ==========================================

/**
 * Read the Monte Carlo calibration snapshot.
 * Only re-renders when the snapshot changes.
 */
const useMCCalibrationState = (): MCCalibrationSnapshot | null => {
	const context = useContext(MCCalibrationStateContext)
	if (context === undefined) {
		throw new Error(
			"useMCCalibrationState must be used within an MCCalibrationProvider"
		)
	}
	return context
}

/**
 * Write the Monte Carlo calibration snapshot.
 * Stable reference — never causes re-renders in dispatch-only consumers.
 */
const useMCCalibrationDispatch = (): Dispatch<
	SetStateAction<MCCalibrationSnapshot | null>
> => {
	const context = useContext(MCCalibrationDispatchContext)
	if (!context) {
		throw new Error(
			"useMCCalibrationDispatch must be used within an MCCalibrationProvider"
		)
	}
	return context
}

/**
 * Read or write the Monte Carlo calibration snapshot from context.
 * Returns `{ snapshot, setSnapshot }`.
 * Use `useMCCalibrationState` or `useMCCalibrationDispatch` directly
 * when you only need one side.
 */
const useMCCalibration = (): {
	snapshot: MCCalibrationSnapshot | null
	setSnapshot: Dispatch<SetStateAction<MCCalibrationSnapshot | null>>
} => {
	const snapshot = useMCCalibrationState()
	const setSnapshot = useMCCalibrationDispatch()
	return { snapshot, setSnapshot }
}

export {
	MCCalibrationProvider,
	useMCCalibration,
	useMCCalibrationState,
	useMCCalibrationDispatch,
}
