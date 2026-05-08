import type { ReactNode } from "react"
import { connection } from "next/server"

interface AuthLayoutProps {
	children: ReactNode
}

const AuthLayout = async ({ children }: AuthLayoutProps) => {
	await connection()

	return (
		<div className="p-m-400 flex min-h-dvh flex-col items-center justify-center pb-l-900">
			{/* Skip-to-content link — visually hidden until focused */}
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-s-300 focus:left-s-300 focus:z-50 focus:rounded-sm focus:bg-acc-100 focus:px-m-400 focus:py-s-200 focus:text-small focus:font-medium focus:text-bg-100"
			>
				Skip to content
			</a>

			<main id="main" className="w-full max-w-sm md:max-w-md">{children}</main>
			<footer className="fixed right-0 bottom-0 left-0 flex items-center justify-center gap-1.5 py-s-300">
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
