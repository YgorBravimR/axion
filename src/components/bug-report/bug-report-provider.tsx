"use client"

import { createContext, useContext, useState, useCallback } from "react"
import type { ReactNode } from "react"

interface BugReportContextType {
	isOpen: boolean
	openBugReport: () => void
	closeBugReport: () => void
}

const BugReportContext = createContext<BugReportContextType | undefined>(undefined)

const useBugReport = (): BugReportContextType => {
	const context = useContext(BugReportContext)
	if (!context) {
		throw new Error("useBugReport must be used within BugReportProvider")
	}
	return context
}

interface BugReportProviderProps {
	children: ReactNode
}

const BugReportProvider = ({ children }: BugReportProviderProps) => {
	const [isOpen, setIsOpen] = useState(false)

	const openBugReport = useCallback(() => setIsOpen(true), [])
	const closeBugReport = useCallback(() => setIsOpen(false), [])

	return (
		<BugReportContext.Provider value={{ isOpen, openBugReport, closeBugReport }}>
			{children}
		</BugReportContext.Provider>
	)
}

export { BugReportProvider, useBugReport }
