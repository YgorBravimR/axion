import { User, Building2, type LucideIcon } from "lucide-react"
import type { Brand } from "@/lib/brands"

/**
 * Maps account type to the corresponding brand theme.
 * This replaces the manual brand selector in settings — the theme
 * is now automatically derived from the account type.
 */
const getAccountTypeBrand = (accountType: string): Brand => {
	switch (accountType) {
		case "prop":
			return "tsr"
		default:
			return "bravo"
	}
}

/**
 * Maps account type to its representative Lucide icon component.
 */
const getAccountIcon = (accountType: string): LucideIcon => {
	switch (accountType) {
		case "prop":
			return Building2
		default:
			return User
	}
}

export { getAccountTypeBrand, getAccountIcon }
