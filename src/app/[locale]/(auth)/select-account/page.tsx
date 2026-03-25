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
		<div className="w-full max-w-sm space-y-m-600 text-center">
			<h1 className="text-h2 font-bold text-txt-100">{t("title")}</h1>
			<p className="text-small text-txt-300">
				{t("signInAgain")}
			</p>
			<Link
				href="/login"
				className="inline-flex items-center gap-2 text-brand-500 hover:text-brand-400"
			>
				<ArrowLeft className="h-4 w-4" />
				{t("backToLoginButton")}
			</Link>
		</div>
	)
}

export { SelectAccountPage as default }
