"use client"

/**
 * Color Picker component built on react-colorful + Radix Popover.
 * Adapted from https://github.com/Fnz11/shadcn-color-picker (MIT).
 *
 * Features:
 * - Visual RGBA gradient picker (hue/saturation/brightness + alpha)
 * - HEX / RGB toggle input (user types in either format)
 * - Always outputs HEX (#RRGGBB or #RRGGBBAA if alpha < 1)
 * - Popover trigger is fully customizable via children
 * - Flicker-free drag: local state drives the picker, parent is notified
 *   via debounced onChange to avoid render-loop storms
 */

import { useState, useCallback, useRef, useEffect } from "react"
import type { ReactNode, ChangeEvent } from "react"
import { RgbaColorPicker } from "react-colorful"
import { Pipette } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Input } from "./input"
import { cn } from "@/lib/utils"

// ─── Color conversion helpers ────────────────────────────────────────────────

interface RgbaColor {
	r: number
	g: number
	b: number
	a: number
}

const toHex = (n: number): string => {
	const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16)
	return hex.length === 1 ? "0" + hex : hex
}

const rgbaToHex = ({ r, g, b, a }: RgbaColor): string => {
	const alpha = Math.round(a * 255)
	return `#${toHex(r)}${toHex(g)}${toHex(b)}${alpha === 255 ? "" : toHex(alpha)}`
}

const rgbaToRgbString = ({ r, g, b }: RgbaColor): string =>
	`${r}, ${g}, ${b}`

const hexToRgba = (hex: string): RgbaColor | null => {
	if (!hex) return null
	let h = hex.replace(/^#/, "")

	if (h.length === 3) {
		h = h.split("").map((c) => c + c).join("")
	}

	if (h.length !== 6 && h.length !== 8) return null

	const r = parseInt(h.substring(0, 2), 16)
	const g = parseInt(h.substring(2, 4), 16)
	const b = parseInt(h.substring(4, 6), 16)
	const a = h.length === 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1

	if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return null
	return { r, g, b, a }
}

const parseRgbString = (input: string): RgbaColor | null => {
	const cleaned = input.replace(/rgb[a]?\s*\(/i, "").replace(")", "").trim()
	const parts = cleaned.split(/[,\s]+/).map(Number)

	if (parts.length < 3 || parts.some(isNaN)) return null

	const [r, g, b] = parts
	const a = parts.length >= 4 ? parts[3] : 1

	return { r, g, b, a: a > 1 ? a / 255 : a }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ColorPickerProps {
	/** Current color value in HEX format */
	value: string
	/** Callback when color changes — always receives HEX */
	onChange: (hex: string) => void
	/** Custom trigger element. Defaults to a pipette icon circle. */
	children?: ReactNode
	/** Additional className for the popover content */
	className?: string
	/**
	 * DOM element to portal the popover into.
	 * When used inside a Dialog, pass the dialog container to keep the popover
	 * within the NextIntlClientProvider context tree.
	 */
	container?: HTMLElement | null
}

const ColorPicker = ({
	value,
	onChange,
	children,
	className,
	container,
}: ColorPickerProps) => {
	const [inputMode, setInputMode] = useState<"hex" | "rgb">("hex")

	// Local state drives the picker — never reads from parent `value` during interaction.
	const [localColor, setLocalColor] = useState<RgbaColor>(
		() => hexToRgba(value) ?? { r: 0, g: 0, b: 0, a: 1 },
	)
	const [hexInput, setHexInput] = useState(value || "#000000")
	const [rgbInput, setRgbInput] = useState(() => {
		const rgba = hexToRgba(value)
		return rgba ? rgbaToRgbString(rgba) : "0, 0, 0"
	})

	// Debounce timer for parent onChange during picker drag
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
	// Tracks whether local interaction is happening (picker drag or typing)
	const interactingRef = useRef(false)

	// Sync from parent ONLY when not interacting (e.g. preset swatch click)
	useEffect(() => {
		if (interactingRef.current) return

		const rgba = hexToRgba(value)
		if (!rgba) return

		// Skip if local state already matches
		const localHex = rgbaToHex(localColor)
		if (localHex.toLowerCase() === value.toLowerCase()) return

		setLocalColor(rgba)
		setHexInput(value)
		setRgbInput(rgbaToRgbString(rgba))
	}, [value]) // eslint-disable-line react-hooks/exhaustive-deps

	// Debounced parent notification — prevents render storms during drag
	const notifyParent = useCallback(
		(hex: string) => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
			debounceRef.current = setTimeout(() => {
				onChange(hex)
			}, 80)
		},
		[onChange],
	)

	// Cleanup debounce timer
	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
		}
	}, [])

	// Update all local state + notify parent (debounced)
	const updateColor = useCallback(
		(rgba: RgbaColor) => {
			const hex = rgbaToHex(rgba)
			setLocalColor(rgba)
			setHexInput(hex)
			setRgbInput(rgbaToRgbString(rgba))
			notifyParent(hex)
		},
		[notifyParent],
	)

	// Picker drag — mark as interacting to block external sync
	const handlePickerChange = useCallback(
		(rgba: RgbaColor) => {
			interactingRef.current = true
			updateColor(rgba)

			// Release interaction lock after drag settles
			if (debounceRef.current) clearTimeout(debounceRef.current)
			debounceRef.current = setTimeout(() => {
				onChange(rgbaToHex(rgba))
				// Small delay before releasing lock so the parent re-render
				// from onChange doesn't trigger the useEffect sync
				setTimeout(() => { interactingRef.current = false }, 50)
			}, 80)
		},
		[onChange, updateColor],
	)

	const handleHexInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		interactingRef.current = true
		const raw = e.target.value
		setHexInput(raw)

		const normalized = raw.startsWith("#") ? raw : `#${raw}`
		const rgba = hexToRgba(normalized)
		if (rgba) {
			setLocalColor(rgba)
			setRgbInput(rgbaToRgbString(rgba))
			notifyParent(normalized)
		}

		setTimeout(() => { interactingRef.current = false }, 400)
	}

	const handleRgbInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		interactingRef.current = true
		const raw = e.target.value
		setRgbInput(raw)

		const rgba = parseRgbString(raw)
		if (rgba) {
			setLocalColor(rgba)
			setHexInput(rgbaToHex(rgba))
			notifyParent(rgbaToHex(rgba))
		}

		setTimeout(() => { interactingRef.current = false }, 400)
	}

	const defaultTrigger = (
		<button
			type="button"
			className="flex h-9 w-9 items-center justify-center rounded-full border border-bg-300 transition-transform hover:scale-110"
			style={{ backgroundColor: value }}
			aria-label="Pick a color"
		>
			<Pipette className="h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
		</button>
	)

	return (
		<Popover>
			<PopoverTrigger asChild>
				{children ?? defaultTrigger}
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="bottom"
				container={container}
				className={cn("w-64 space-y-s-300", className)}
			>
				<RgbaColorPicker
					color={localColor}
					onChange={handlePickerChange}
					className="!w-full"
					style={{ height: "160px" }}
				/>

				{/* HEX / RGB toggle + input */}
				<div className="flex items-center gap-s-200">
					<button
						type="button"
						onClick={() => setInputMode(inputMode === "hex" ? "rgb" : "hex")}
						className="shrink-0 rounded border border-bg-300 px-s-200 py-s-100 text-tiny font-mono text-txt-200 transition-colors hover:bg-bg-300"
						aria-label="Toggle between HEX and RGB input"
					>
						{inputMode === "hex" ? "HEX" : "RGB"}
					</button>
					{inputMode === "hex" ? (
						<Input
							id="color-picker-hex"
							value={hexInput}
							onChange={handleHexInputChange}
							className="h-8 font-mono text-small tracking-wider"
							placeholder="#FF5733"
							aria-label="Hex color value"
						/>
					) : (
						<Input
							id="color-picker-rgb"
							value={rgbInput}
							onChange={handleRgbInputChange}
							className="h-8 font-mono text-small tracking-wider"
							placeholder="255, 87, 51"
							aria-label="RGB color value"
						/>
					)}
				</div>

				{/* Preview swatch */}
				<div className="flex items-center gap-s-200">
					<div
						className="h-6 w-6 rounded-full border border-bg-300"
						style={{ backgroundColor: rgbaToHex(localColor) }}
					/>
					<span className="font-mono text-tiny text-txt-300 uppercase">
						{rgbaToHex(localColor)}
					</span>
				</div>
			</PopoverContent>
		</Popover>
	)
}

export { ColorPicker }
export type { ColorPickerProps }
