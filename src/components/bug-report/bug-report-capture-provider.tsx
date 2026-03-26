"use client"

import { useEffect } from "react"
import type { ReactNode } from "react"
import { initCapture } from "@/lib/bug-report-capture"

/**
 * Initializes console/network log capture on mount.
 * Place this once in the app-level layout so capture is active on every page.
 */
const BugReportCaptureProvider = ({ children }: { children: ReactNode }) => {
	useEffect(() => {
		initCapture()
	}, [])

	return children
}

export { BugReportCaptureProvider }
