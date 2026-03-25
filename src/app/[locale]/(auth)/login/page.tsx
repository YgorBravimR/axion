import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { LoginForm } from "@/components/auth"

interface LoginPageProps {
	searchParams: Promise<{ callbackUrl?: string; registered?: string }>
}

const LoginPage = async ({ searchParams }: LoginPageProps) => {
	const session = await auth()
	const params = await searchParams

	// If already logged in, redirect
	if (session?.user) {
		redirect(params.callbackUrl || "/")
	}

	return <LoginForm callbackUrl={params.callbackUrl} />
}

export { LoginPage as default }
