import { setRequestLocale } from "next-intl/server"
import type { ReactNode } from "react"

interface PlanLayoutProps {
	children: ReactNode
	params: Promise<{ locale: string }>
}

const PlanLayout = async ({ children, params }: PlanLayoutProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	return (
		<div className="min-h-dvh bg-bg-100">
			<main className="mx-auto max-w-6xl p-m-400 sm:p-m-500 lg:p-m-600">{children}</main>
		</div>
	)
}

export { PlanLayout as default }
