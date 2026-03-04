import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

const ForgotPasswordPage = async () => {
	const session = await auth()

	// If already logged in, redirect to dashboard
	if (session?.user) {
		redirect("/")
	}

	return <ForgotPasswordForm />
}

export default ForgotPasswordPage
