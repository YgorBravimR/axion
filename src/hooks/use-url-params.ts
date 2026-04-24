"use client"

import { useCallback, useMemo } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import {
	parseArrayParam,
	serializeArrayParam,
	parseBooleanParam,
	parseNumberParam,
} from "@/lib/url-params"

type ParamValue = string | string[] | number | boolean | null

interface UseUrlParamsReturn {
	/** Get a single string param */
	get: (key: string) => string | null
	/** Get a CSV-encoded array param */
	getArray: (key: string) => string[]
	/** Get a numeric param with fallback */
	getNumber: (key: string, fallback: number) => number
	/** Get a boolean param ("1" = true) */
	getBoolean: (key: string) => boolean
	/** Merge updates into current params. null/empty removes the param. Auto-resets page unless explicitly included. */
	set: (updates: Record<string, ParamValue>) => void
}

const useUrlParams = (): UseUrlParamsReturn => {
	const searchParams = useSearchParams()
	const router = useRouter()
	const pathname = usePathname()

	const get = useCallback(
		(key: string): string | null => searchParams.get(key),
		[searchParams]
	)

	const getArray = useCallback(
		(key: string): string[] => parseArrayParam(searchParams.get(key)),
		[searchParams]
	)

	const getNumber = useCallback(
		(key: string, fallback: number): number =>
			parseNumberParam(searchParams.get(key), fallback),
		[searchParams]
	)

	const getBoolean = useCallback(
		(key: string): boolean => parseBooleanParam(searchParams.get(key)),
		[searchParams]
	)

	const set = useCallback(
		(updates: Record<string, ParamValue>) => {
			const params = new URLSearchParams(searchParams.toString())

			// Auto-reset page to 1 on filter change unless explicitly included
			const hasExplicitPage = "page" in updates
			if (!hasExplicitPage) {
				params.delete("page")
			}

			for (const [key, value] of Object.entries(updates)) {
				if (value === null || value === undefined) {
					params.delete(key)
					continue
				}

				if (Array.isArray(value)) {
					const serialized = serializeArrayParam(value)
					if (serialized) {
						params.set(key, serialized)
					} else {
						params.delete(key)
					}
					continue
				}

				if (typeof value === "boolean") {
					if (value) {
						params.set(key, "1")
					} else {
						params.delete(key)
					}
					continue
				}

				if (typeof value === "number") {
					params.set(key, String(value))
					continue
				}

				// String — set if non-empty, delete if empty
				if (value) {
					params.set(key, value)
				} else {
					params.delete(key)
				}
			}

			const queryString = params.toString()
			const url = queryString ? `${pathname}?${queryString}` : pathname
			router.push(url, { scroll: false })
		},
		[searchParams, router, pathname]
	)

	return useMemo(() => ({ get, getArray, getNumber, getBoolean, set }), [get, getArray, getNumber, getBoolean, set])
}

export { useUrlParams }
export type { UseUrlParamsReturn }
