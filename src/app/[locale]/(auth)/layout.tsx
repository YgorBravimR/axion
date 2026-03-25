import type { ReactNode } from "react"
import { connection } from "next/server"

interface AuthLayoutProps {
	children: ReactNode
}

const AuthLayout = async ({ children }: AuthLayoutProps) => {
	await connection()

	return (
		<div className="p-m-400 flex min-h-dvh flex-col items-center justify-center pb-16">
			{children}
			<footer className="fixed right-0 bottom-0 left-0 flex items-center justify-center gap-1.5 py-3">
				<span className="text-micro text-txt-placeholder tracking-wide">
					© {new Date().getFullYear()} Axion
				</span>
				<span className="text-micro text-txt-placeholder">·</span>
				<span className="text-micro text-txt-placeholder tracking-wide">
					by
				</span>
				<span className="text-micro text-acc-200 font-medium tracking-[0.15em]">
					BRAVO
				</span>
			</footer>
		</div>
	)
}

export { AuthLayout as default }
