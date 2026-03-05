import { notFound } from "next/navigation"
import { NextIntlClientProvider } from "next-intl"
import { getMessages, setRequestLocale } from "next-intl/server"
import { ThemeProvider } from "next-themes"
import { ToastProvider } from "@/components/ui/toast"
import { LoadingOverlayProvider } from "@/components/ui/loading-overlay"
import { AccountTransitionOverlayProvider } from "@/components/ui/account-transition-overlay"
import { AuthProvider } from "@/components/auth"
import { BrandProvider } from "@/components/providers/brand-provider"
import type { ReactNode } from "react"
import { routing } from "@/i18n/routing"

interface LocaleLayoutProps {
	children: ReactNode
	params: Promise<{ locale: string }>
}

/**
 * Generates static params for all supported locales.
 *
 * @returns Array of locale params for static generation
 */
const generateStaticParams = () => {
	return routing.locales.map((locale) => ({ locale }))
}

/**
 * Root layout component for locale-specific pages.
 * Provides internationalization, theming, and authentication context.
 *
 * @param props - The layout props
 * @param props.children - Child components to render
 * @param props.params - Promise containing the locale parameter
 */
const LocaleLayout = async ({ children, params }: LocaleLayoutProps) => {
	const { locale } = await params

	// Validate that the incoming `locale` parameter is valid
	if (!routing.locales.includes(locale as "pt-BR" | "en")) {
		notFound()
	}

	// Enable static rendering
	setRequestLocale(locale)

	// Providing all messages to the client side
	const messages = await getMessages()

	return (
		<NextIntlClientProvider messages={messages}>
			<ThemeProvider
				attribute="data-theme"
				defaultTheme="dark"
				enableSystem={false}
				disableTransitionOnChange={false}
			>
				{/* <BrandProvider> */}
				<ToastProvider>
					<LoadingOverlayProvider>
						<AuthProvider>
							<AccountTransitionOverlayProvider>
								<div className="bg-bg-100 min-h-dvh">{children}</div>
							</AccountTransitionOverlayProvider>
						</AuthProvider>
					</LoadingOverlayProvider>
				</ToastProvider>
				{/* </BrandProvider> */}
			</ThemeProvider>
		</NextIntlClientProvider>
	)
}

export { LocaleLayout as default, generateStaticParams }
