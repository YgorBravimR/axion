import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { VerifyEmailForm } from "@/components/auth/verify-email-form"

const VerifyEmailPage = async () => {
	const session = await auth()

	// If already logged in, redirect to dashboard
	if (session?.user) {
		redirect("/")
	}

	return <VerifyEmailForm />
}

export { VerifyEmailPage as default }
