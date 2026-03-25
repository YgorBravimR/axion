"use client"

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react"
import { BRANDS, DEFAULT_BRAND, type Brand } from "@/lib/brands"

interface BrandContextType {
	brand: Brand
	setBrand: (brand: Brand) => void
	brands: readonly Brand[]
}

interface BrandProviderProps {
	children: ReactNode
}

const BrandContext = createContext<BrandContextType | undefined>(undefined)

/**
 * Provider component for brand theming context.
 * Brand switching is currently disabled — only "default" is active.
 * To re-enable, restore getStoredBrand initializer and setBrand logic from git history.
 *
 * @param props - The provider props
 * @param props.children - Child components to wrap
 */
const BrandProvider = ({ children }: BrandProviderProps) => {
	const [brand] = useState<Brand>("default")
	const setBrand = useCallback((_newBrand: Brand) => {}, [])

	const value = useMemo<BrandContextType>(
		() => ({ brand, setBrand, brands: BRANDS }),
		[brand, setBrand]
	)

	return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

/**
 * Hook to access the brand context.
 * Must be used within a BrandProvider.
 *
 * @returns The brand context containing current brand and setter
 * @throws Error if used outside of BrandProvider
 */
const useBrand = (): BrandContextType => {
	const context = useContext(BrandContext)
	if (context === undefined) {
		throw new Error("useBrand must be used within a BrandProvider")
	}
	return context
}

export { BrandProvider, useBrand, BRANDS, DEFAULT_BRAND }
export type { Brand } from "@/lib/brands"
