"use client"

import { createContext, useContext, useState, useMemo, type ReactNode } from "react"
import type { MCCalibrationSnapshot } from "@/types/mc-calibration"

interface MCCalibrationContextValue {
	snapshot: MCCalibrationSnapshot | null
	setSnapshot: (snapshot: MCCalibrationSnapshot | null) => void
}

const MCCalibrationContext = createContext<MCCalibrationContextValue | null>(null)

interface MCCalibrationProviderProps {
	children: ReactNode
}

/**
 * Provides a lightweight in-memory bridge for Monte Carlo calibration data.
 * When a user runs a Monte Carlo simulation, the snapshot is stored here.
 * Equity Shield can then read it to suggest parameter values.
 *
 * Ephemeral by design: survives SPA navigation, lost on hard refresh.
 * This is intentional — stale calibration from yesterday shouldn't silently influence today.
 */
const MCCalibrationProvider = ({ children }: MCCalibrationProviderProps) => {
	const [snapshot, setSnapshot] = useState<MCCalibrationSnapshot | null>(null)

	const value = useMemo<MCCalibrationContextValue>(
		() => ({ snapshot, setSnapshot }),
		[snapshot]
	)

	return (
		<MCCalibrationContext.Provider value={value}>
			{children}
		</MCCalibrationContext.Provider>
	)
}

/**
 * Read or write the Monte Carlo calibration snapshot from context.
 * Returns `{ snapshot, setSnapshot }`.
 */
const useMCCalibration = (): MCCalibrationContextValue => {
	const context = useContext(MCCalibrationContext)
	if (!context) {
		throw new Error("useMCCalibration must be used within an MCCalibrationProvider")
	}
	return context
}

export { MCCalibrationProvider, useMCCalibration }
