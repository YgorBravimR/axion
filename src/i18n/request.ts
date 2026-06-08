import { getRequestConfig } from "next-intl/server"
import { routing } from "./routing"

// eslint-disable-next-line no-restricted-syntax -- next-intl requires a default export for the request config module
export default getRequestConfig(async ({ requestLocale }) => {
	// This typically corresponds to the `[locale]` segment
	let locale = await requestLocale

	// Ensure that a valid locale is used
	if (!locale || !routing.locales.includes(locale as "pt-BR" | "en")) {
		locale = routing.defaultLocale
	}

	const messageModule = (await import(
		`../../messages/${locale}.json`
	)) as unknown
	const messages = (() => {
		if (
			typeof messageModule === "object" &&
			messageModule !== null &&
			"default" in messageModule
		) {
			return (messageModule as { default: Record<string, unknown> }).default
		}
		return {} as Record<string, unknown>
	})()

	return {
		locale,
		messages,
	}
})
