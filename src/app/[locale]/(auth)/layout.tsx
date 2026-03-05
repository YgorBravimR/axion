import type { ReactNode } from "react"

interface AuthLayoutProps {
	children: ReactNode
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
	return (
		<div className="flex min-h-dvh items-center justify-center p-m-400">
			{children}
		</div>
	)
}

export default AuthLayout
