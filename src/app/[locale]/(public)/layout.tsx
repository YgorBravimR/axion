import type { ReactNode } from "react"

/**
 * Public layout — no sidebar, no auth required.
 * Used for pages like /painel that are accessible without login.
 */

interface PublicLayoutProps {
	children: ReactNode
}

const PublicLayout = ({ children }: PublicLayoutProps) => (
	<div className="bg-bg-100 min-h-dvh">{children}</div>
)

export default PublicLayout
