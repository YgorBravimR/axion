"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"

const NotFound = () => {
	const t = useTranslations("errors.notFound")

	return (
		<div className="flex flex-col items-center justify-center min-h-[60dvh] gap-4">
			<h1 className="text-4xl font-bold text-foreground">{t("code")}</h1>
			<p className="text-lg text-muted-foreground">{t("title")}</p>
			<Link
				href="/"
				className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary/90 transition-colors"
			>
				{t("goHome")}
			</Link>
		</div>
	)
}

export default NotFound
