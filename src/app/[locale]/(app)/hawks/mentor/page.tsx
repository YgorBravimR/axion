import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getCurrentAccount } from "@/app/actions/auth"
import { isHawksModeActive } from "@/lib/hawks/deactivate-mode"
import { isCurrentUserAdmin } from "@/app/actions/hawks-mentor"
import { HawksMentorComposer, HawksCohortComparison } from "@/components/hawks"

const HawksMentorPage = async () => {
	const account = await getCurrentAccount()
	if (!account) redirect("/login")

	const hawksActive = await isHawksModeActive(account.id)
	if (!hawksActive) redirect("/settings?tab=mode")

	const admin = await isCurrentUserAdmin()
	const t = await getTranslations("hawksMentor.page")

	return (
		<div className="mx-auto max-w-4xl space-y-m-500 px-m-600 py-l-700">
			<header className="space-y-s-200">
				<h1 className="text-fs-700 font-semibold tracking-tight">{t("title")}</h1>
				<p className="text-text-200 text-fs-300">{t("subtitle")}</p>
			</header>

			<HawksCohortComparison />

			{admin ? (
				<HawksMentorComposer />
			) : (
				<div className="rounded-md border border-bg-300 bg-bg-200/40 p-m-400 text-text-300 text-fs-200">
					{t("nonAdminNotice")}
				</div>
			)}
		</div>
	)
}

export default HawksMentorPage
