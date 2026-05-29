"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { ParameterRange } from "@/lib/optimize/parameter-grid"

interface SweptPathsContextValue {
	paths: Set<string>
}

const SweptPathsContext = createContext<SweptPathsContextValue>({
	paths: new Set(),
})

interface SweptPathsProviderProps {
	activeRanges: ParameterRange[]
	children: ReactNode
}

const SweptPathsProvider = ({
	activeRanges,
	children,
}: SweptPathsProviderProps) => {
	const value = useMemo<SweptPathsContextValue>(() => {
		const paths = new Set<string>()
		for (const range of activeRanges) {
			if (range.kind === "numeric") {
				paths.add(range.path)
			} else if (range.kind === "enum" && range.selectedValues.length > 0) {
				paths.add(range.path)
			}
		}
		return { paths }
	}, [activeRanges])

	return (
		<SweptPathsContext.Provider value={value}>
			{children}
		</SweptPathsContext.Provider>
	)
}

const useIsSwept = (path: string): boolean => {
	const { paths } = useContext(SweptPathsContext)
	return paths.has(path)
}

const useAnySwept = (pathList: string[]): boolean => {
	const { paths } = useContext(SweptPathsContext)
	return pathList.some((p) => paths.has(p))
}

const useAllSwept = (pathList: string[]): boolean => {
	const { paths } = useContext(SweptPathsContext)
	return pathList.length > 0 && pathList.every((p) => paths.has(p))
}

export { SweptPathsProvider, useIsSwept, useAnySwept, useAllSwept }
