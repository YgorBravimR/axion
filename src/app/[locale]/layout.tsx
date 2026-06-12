import { notFound } from "next/navigation"
import { NextIntlClientProvider } from "next-intl"
import {
	getMessages,
	getTranslations,
	setRequestLocale,
} from "next-intl/server"
import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import { ToastProvider } from "@/components/ui/toast"
import { LoadingOverlayProvider } from "@/components/ui/loading-overlay"
import { AccountTransitionOverlayProvider } from "@/components/ui/account-transition-overlay"
import { AuthProvider } from "@/components/auth"
import { PostHogProvider } from "@/components/providers/posthog-provider"
import type { ReactNode } from "react"
import { routing } from "@/i18n/routing"
import { auth } from "@/auth"

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
 * Generates locale-aware metadata for the page title and description.
 *
 * @param params - The route params containing the locale
 * @returns Translated metadata for the current locale
 */
const generateMetadata = async ({
	params,
}: {
	params: Promise<{ locale: string }>
}): Promise<Metadata> => {
	const { locale } = await params
	const t = await getTranslations({ locale, namespace: "common" })

	return {
		title: t("appName"),
		description: t("version"),
	}
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

	// Fetch session server-side to seed the client SessionProvider cache,
	// eliminating the initial /api/auth/session network request on every page.
	const [messages, session] = await Promise.all([getMessages(), auth()])

	return (
		<NextIntlClientProvider messages={messages}>
			<ThemeProvider
				attribute="data-theme"
				defaultTheme="dark"
				enableSystem={false}
				disableTransitionOnChange={false}
			>
				<ToastProvider>
					<LoadingOverlayProvider>
						<AuthProvider session={session}>
							<PostHogProvider>
								<AccountTransitionOverlayProvider>
									<div className="bg-bg-100 min-h-dvh">{children}</div>
								</AccountTransitionOverlayProvider>
							</PostHogProvider>
						</AuthProvider>
					</LoadingOverlayProvider>
				</ToastProvider>
			</ThemeProvider>
		</NextIntlClientProvider>
	)
}

export { LocaleLayout as default, generateStaticParams, generateMetadata }
