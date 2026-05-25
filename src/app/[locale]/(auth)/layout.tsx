import type { ReactNode } from "react"
import { connection } from "next/server"

interface AuthLayoutProps {
	children: ReactNode
}

const AuthLayout = async ({ children }: AuthLayoutProps) => {
	await connection()

	return (
		<div className="p-m-400 pb-l-900 flex min-h-dvh flex-col items-center justify-center">
			{/* Skip-to-content link — visually hidden until focused */}
			<a
				href="#main"
				className="focus:top-s-300 focus:left-s-300 focus:bg-acc-100 focus:px-m-400 focus:py-s-200 focus:text-small focus:text-bg-100 sr-only focus:not-sr-only focus:fixed focus:z-50 focus:rounded-sm focus:font-medium"
			>
				Skip to content
			</a>

			<main id="main" className="w-full max-w-sm md:max-w-md">
				{children}
			</main>
			<footer className="py-s-300 fixed right-0 bottom-0 left-0 flex items-center justify-center gap-1.5">
				<span className="text-micro text-txt-placeholder tracking-wide">
					© {new Date().getFullYear()} Axion
				</span>
				<span className="text-micro text-txt-placeholder">·</span>
				<span className="text-micro text-txt-placeholder tracking-wide">
					by
				</span>
				<span className="text-micro text-heritage-gold font-medium tracking-[0.15em]">
					BRAVO
				</span>
			</footer>
		</div>
	)
}

export { AuthLayout as default }
