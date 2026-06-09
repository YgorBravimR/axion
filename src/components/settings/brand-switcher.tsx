"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useBrand, type Brand } from "@/components/providers/brand-provider"
import { updateAccountBrand } from "@/app/actions/settings"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

/** Color swatches for each brand to give visual preview. These hex values are preview swatches that match the brand theme selectors in globals.css (.brand-axion, .brand-default, etc.). */
const brandColors: Record<Brand, { primary: string; bg: string }> = {
	axion: { primary: "#8B5CF6", bg: "#08090A" },
	default: { primary: "#8080ff", bg: "#151C2C" },
	bravo: { primary: "#D4AF37", bg: "#151C2C" },
	midnight: { primary: "#AAAF37", bg: "#181a1b" },
	retro: { primary: "#dddd7a", bg: "#171614" },
	luxury: { primary: "#C0C0C0", bg: "#141416" },
	tsr: { primary: "#2563EB", bg: "#161B22" },
	neon: { primary: "#00FFFF", bg: "#12121C" },
	lannister: { primary: "#D4A843", bg: "#2D0A10" },
}

interface BrandColorSwatchProps {
	brand: Brand
	label: string
}

/**
 * Renders a color swatch indicator for a brand.
 *
 * @param props - The component props
 * @param props.brand - The brand to display
 * @param props.label - The label text to display
 */
const BrandColorSwatch = ({ brand, label }: BrandColorSwatchProps) => (
	<div className="gap-s-200 flex items-center">
		<span
			className="border-bg-300 h-3 w-3 rounded-full border"
			style={{ backgroundColor: brandColors[brand].primary }}
			aria-hidden="true"
		/>
		{label}
	</div>
)

/**
 * Component for switching between brand color schemes.
 * Provides a dropdown selector with visual color previews.
 * Persists the selected brand to the database via server action.
 */
const BrandSwitcher = () => {
	const t = useTranslations("settings.profile")
	const { brand, setBrand, brands } = useBrand()
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	const handleBrandChange = (value: string) => {
		const newBrand = value as Brand
		// Optimistic UI update
		setBrand(newBrand)
		// Persist to database
		void updateAccountBrand(newBrand)
	}

	// Avoid hydration mismatch
	if (!mounted) {
		return (
			<div className="bg-bg-300 h-9 w-36 animate-pulse rounded-md motion-reduce:animate-none" />
		)
	}

	return (
		<Select value={brand} onValueChange={handleBrandChange}>
			<SelectTrigger
				id="brand-switcher"
				className="w-40"
				aria-label={t("colorScheme")}
			>
				<SelectValue>
					<BrandColorSwatch brand={brand} label={t(`brands.${brand}`)} />
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{brands.map((b) => (
					<SelectItem key={b} value={b}>
						<BrandColorSwatch brand={b} label={t(`brands.${b}`)} />
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

export { BrandSwitcher }
