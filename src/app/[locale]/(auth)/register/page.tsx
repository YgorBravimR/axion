import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { RegisterForm } from "@/components/auth"

const RegisterPage = async () => {
	const session = await auth()

	// If already logged in, redirect
	if (session?.user) {
		redirect("/")
	}

	return <RegisterForm />
}

export { RegisterPage as default }
