"use client"

import { forwardRef } from "react"
import type { ChangeEvent, ComponentProps, FocusEvent } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type Decimals = 0 | 2
type Unit = "reais" | "cents"

const stripDigits = (s: string): string => s.replace(/\D/g, "")

const formatBR = (digits: string, decimals: Decimals): string => {
	if (!digits) return ""
	if (decimals === 0) {
		return Number(digits).toLocaleString("pt-BR")
	}
	const padded = digits.padStart(3, "0")
	const intPart = padded.slice(0, -2).replace(/^0+(?=\d)/, "")
	const decPart = padded.slice(-2)
	const intFormatted = Number(intPart || "0").toLocaleString("pt-BR")
	return `${intFormatted},${decPart}`
}

const displayUnitsPerReais = (decimals: Decimals): number => (decimals === 2 ? 100 : 1)
const valueUnitsPerReais = (unit: Unit): number => (unit === "cents" ? 100 : 1)

const valueToDigits = (
	value: number | null | undefined,
	decimals: Decimals,
	unit: Unit,
): string => {
	if (value == null || !Number.isFinite(value)) return ""
	const ratio = displayUnitsPerReais(decimals) / valueUnitsPerReais(unit)
	const scaled = Math.round(value * ratio)
	if (scaled === 0) return ""
	return String(scaled)
}

const digitsToValue = (
	digits: string,
	decimals: Decimals,
	unit: Unit,
): number | null => {
	if (!digits) return null
	const n = Number(digits)
	if (!Number.isFinite(n)) return null
	const ratio = valueUnitsPerReais(unit) / displayUnitsPerReais(decimals)
	return n * ratio
}

interface CurrencyInputProps
	extends Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type" | "inputMode"> {
	id: string
	value: number | null | undefined
	onValueChange: (next: number | null) => void
	decimals?: Decimals
	unit?: Unit
	showPrefix?: boolean
}

const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
	(
		{
			value,
			onValueChange,
			decimals = 2,
			unit = "reais",
			showPrefix = true,
			className,
			placeholder,
			onFocus,
			...rest
		},
		ref,
	) => {
		const digits = valueToDigits(value, decimals, unit)
		const display = formatBR(digits, decimals)

		const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
			const stripped = stripDigits(e.target.value)
			onValueChange(digitsToValue(stripped, decimals, unit))
		}

		const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
			e.target.select()
			onFocus?.(e)
		}

		const placeholderText = placeholder ?? (decimals === 2 ? "0,00" : "0")

		if (!showPrefix) {
			return (
				<Input
					ref={ref}
					type="text"
					inputMode="numeric"
					autoComplete="off"
					value={display}
					onChange={handleChange}
					onFocus={handleFocus}
					placeholder={placeholderText}
					className={cn("font-mono tabular-nums", className)}
					{...rest}
				/>
			)
		}

		return (
			<div className="relative">
				<span
					aria-hidden="true"
					className="pointer-events-none absolute left-s-300 top-1/2 -translate-y-1/2 select-none font-mono text-small text-txt-300"
				>
					R$
				</span>
				<Input
					ref={ref}
					type="text"
					inputMode="numeric"
					autoComplete="off"
					value={display}
					onChange={handleChange}
					onFocus={handleFocus}
					placeholder={placeholderText}
					className={cn("pl-l-700 font-mono tabular-nums", className)}
					{...rest}
				/>
			</div>
		)
	},
)
CurrencyInput.displayName = "CurrencyInput"

export type { CurrencyInputProps }
export { CurrencyInput }
