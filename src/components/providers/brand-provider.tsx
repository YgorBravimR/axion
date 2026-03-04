"use client"

import { createContext, useContext, useState, useCallback } from "react"
import { BRANDS, DEFAULT_BRAND, isValidBrand, type Brand } from "@/lib/brands"

interface BrandContextType {
	brand: Brand
	setBrand: (brand: Brand) => void
	brands: readonly Brand[]
}

interface BrandProviderProps {
	children: React.ReactNode
	defaultBrand?: Brand
}

const BrandContext = createContext<BrandContextType | undefined>(undefined)

/**
 * Reads the persisted brand from localStorage.
 * Returns the stored brand if valid, otherwise falls back to defaultBrand.
 * Safe to call during SSR (returns fallback).
 */
const getStoredBrand = (fallback: Brand): Brand => {
	if (typeof window === "undefined") return fallback
	try {
		const stored = localStorage.getItem("brand")
		return isValidBrand(stored) ? stored : fallback
	} catch {
		return fallback
	}
}

/**
 * Provider component for brand theming context.
 * Manages brand selection state and applies it to the DOM.
 *
 * The blocking <BrandScript /> in <head> applies the persisted brand before first paint.
 * This provider's useState initializer reads the same localStorage value, so React state
 * matches the DOM from the start — no flash, no extra useEffect needed.
 *
 * @param props - The provider props
 * @param props.children - Child components to wrap
 * @param props.defaultBrand - Default brand to use when no localStorage value exists
 */
const BrandProvider = ({ children, defaultBrand = DEFAULT_BRAND }: BrandProviderProps) => {
	// DISABLED: Brand switching is disabled. Only "default" layout is active.
	// To re-enable, restore getStoredBrand initializer and setBrand logic below.
	const [brand] = useState<Brand>(() => "default")
	// const [brand, setBrandState] = useState<Brand>(() => getStoredBrand(defaultBrand))

	// No-op while brand switching is disabled
	const setBrand = useCallback((_newBrand: Brand) => {}, [])
	// const setBrand = useCallback((newBrand: Brand) => {
	// 	if (!isValidBrand(newBrand)) return
	// 	setBrandState(newBrand)
	// 	document.documentElement.setAttribute("data-brand", newBrand)
	// 	try {
	// 		localStorage.setItem("brand", newBrand)
	// 	} catch {
	// 		// localStorage unavailable (e.g. private browsing quota exceeded)
	// 	}
	// }, [])

	const value: BrandContextType = {
		brand,
		setBrand,
		brands: BRANDS,
	}

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
export { isValidBrand } from "@/lib/brands"
export type { Brand } from "@/lib/brands"
