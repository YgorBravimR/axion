"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"

const NotFound = () => {
	const t = useTranslations("errors.notFound")

	return (
		<div className="flex flex-col items-center justify-center min-h-[60dvh] gap-m-400">
			<h1 className="text-h1 font-bold text-txt-100">{t("code")}</h1>
			<p className="text-h3 text-txt-300">{t("title")}</p>
			<Button id="not-found-go-home" asChild>
				<Link href="/">{t("goHome")}</Link>
			</Button>
		</div>
	)
}

export default NotFound
