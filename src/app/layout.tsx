import type { ReactNode } from "react"
import type { Metadata } from "next"
import { Public_Sans, Geist_Mono } from "next/font/google"
import "./globals.css"

const publicSans = Public_Sans({
	variable: "--font-public-sans",
	subsets: ["latin"],
	weight: ["300", "400", "500", "600", "700", "800"],
})

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
})

export const metadata: Metadata = {
	title: "Axion",
	description: "Axion — Your trading source of truth",
	icons: {
		icon: "/axion-favicon-32.png",
		shortcut: "/axion-favicon-32.png",
		apple: "/axion-icon-192.png",
	},
}

interface RootLayoutProps {
	children: ReactNode
}

const RootLayout = ({ children }: RootLayoutProps) => {
	return (
		<html suppressHydrationWarning data-brand="axion">
			<body
				className={`${publicSans.variable} ${geistMono.variable} font-sans antialiased`}
			>
				{children}
			</body>
		</html>
	)
}

export { RootLayout as default }
