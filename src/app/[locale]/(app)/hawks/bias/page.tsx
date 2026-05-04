import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getCurrentAccount } from "@/app/actions/auth"
import { isHawksModeActive } from "@/lib/hawks/deactivate-mode"
import {
	HawksBiasRitual,
	HawksCircuitBreakerNotice,
} from "@/components/hawks"

const HawksBiasPage = async () => {
	const account = await getCurrentAccount()
	if (!account) redirect("/login")

	const hawksActive = await isHawksModeActive(account.id)
	if (!hawksActive) redirect("/settings?tab=mode")

	const t = await getTranslations("hawksBias.page")

	return (
		<div className="mx-auto max-w-3xl space-y-m-500 px-m-600 py-l-700">
			<header className="space-y-s-200">
				<h1 className="text-h1 font-semibold tracking-tight">{t("title")}</h1>
				<p className="text-text-200 text-body">{t("subtitle")}</p>
			</header>

			<HawksCircuitBreakerNotice />
			<HawksBiasRitual />
		</div>
	)
}

export default HawksBiasPage
