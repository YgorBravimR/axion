import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getCurrentAccount } from "@/app/actions/auth"
import { isHawksModeActive } from "@/lib/hawks/deactivate-mode"
import { HawksPresetsBoard } from "@/components/hawks"

const HawksPresetsPage = async () => {
	const account = await getCurrentAccount()
	if (!account) redirect("/login")

	const hawksActive = await isHawksModeActive(account.id)
	if (!hawksActive) redirect("/settings?tab=mode")

	const t = await getTranslations("hawksPresets.page")

	return (
		<div className="mx-auto max-w-4xl space-y-m-500 px-m-600 py-l-700">
			<header className="space-y-s-200">
				<h1 className="text-fs-700 font-semibold tracking-tight">{t("title")}</h1>
				<p className="text-text-200 text-fs-300">{t("subtitle")}</p>
			</header>
			<HawksPresetsBoard />
		</div>
	)
}

export default HawksPresetsPage
