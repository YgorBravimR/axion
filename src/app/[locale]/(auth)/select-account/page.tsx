import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

const SelectAccountPage = async () => {
	const session = await auth()
	const t = await getTranslations("auth.selectAccount")

	// If not logged in, redirect to login
	if (!session?.user) {
		redirect("/login")
	}

	// If already has account selected, redirect to dashboard
	if (session.user.accountId) {
		redirect("/")
	}

	// If user reaches here directly without going through the login flow,
	// redirect them to login since we need credentials to complete sign-in
	return (
		<div className="space-y-m-600 w-full max-w-sm text-center md:max-w-md lg:max-w-lg">
			<h1 className="text-h2 text-txt-100 font-bold">{t("title")}</h1>
			<p className="text-small text-txt-300">{t("signInAgain")}</p>
			<Link
				href="/login"
				className="text-brand-500 hover:text-brand-400 gap-s-200 inline-flex items-center"
			>
				<ArrowLeft className="h-4 w-4" aria-hidden="true" />
				{t("backToLoginButton")}
			</Link>
		</div>
	)
}

export { SelectAccountPage as default }
