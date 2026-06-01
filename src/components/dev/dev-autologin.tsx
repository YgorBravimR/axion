"use client"

import { useEffect, useRef } from "react"

interface DevAutoLoginProps {
	callbackUrl?: string
}

// Dev-only: when NEXT_PUBLIC_DEV_AUTOLOGIN is "1", redirect the unauthenticated
// /login page to the server-side auto-login route. The route reads the password
// from server env — the browser never sees it.
//
// Server-side gating in /api/dev/autologin enforces NODE_ENV !== "production",
// so this component is a no-op in prod even if the public flag leaks.
export const DevAutoLogin = ({ callbackUrl }: DevAutoLoginProps) => {
	const fired = useRef(false)

	useEffect(() => {
		if (fired.current) {
			return
		}
		if (process.env.NEXT_PUBLIC_DEV_AUTOLOGIN !== "1") {
			return
		}
		fired.current = true

		const raw = callbackUrl || "/"
		// Guard against loops: never bounce back to login or the autologin route.
		const safe =
			raw.startsWith("/login") ||
			raw.startsWith("/api/dev/autologin") ||
			raw.match(/^\/[a-z]{2}(-[A-Z]{2})?\/login(\/|$|\?)/)
				? "/"
				: raw
		const url = `/api/dev/autologin?callbackUrl=${encodeURIComponent(safe)}`
		window.location.replace(url)
	}, [callbackUrl])

	return null
}
