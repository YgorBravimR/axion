"use client"

import posthog from "posthog-js"
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react"
import { useEffect, Suspense } from "react"
import { useSession } from "next-auth/react"
import { usePathname, useSearchParams } from "next/navigation"
import type { ReactNode } from "react"

// Initialize PostHog once (client-side only)
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
	posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
		api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "/ingest",
		person_profiles: "identified_only",
		capture_pageview: false, // We capture manually for SPA navigation
		capture_pageleave: true,
		// Session replay config — financial app, mask everything
		session_recording: {
			maskAllInputs: true,
			maskTextSelector: "[data-ph-mask]",
		},
		loaded: (ph) => {
			if (process.env.NODE_ENV === "development") {
				ph.debug()
			}
		},
	})
}

/**
 * Tracks SPA pageview events on route changes.
 * Requires Suspense boundary because useSearchParams() suspends in App Router.
 */
const PostHogPageview = () => {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const ph = usePostHog()

	useEffect(() => {
		if (!pathname || !ph) {
			return
		}

		const url = searchParams?.size
			? `${pathname}?${searchParams.toString()}`
			: pathname

		ph.capture("$pageview", { $current_url: url })
	}, [pathname, searchParams, ph])

	return null
}

/**
 * Identifies authenticated users in PostHog and resets on logout.
 * Ties anonymous pre-login activity to the user after authentication.
 */
const PostHogIdentify = () => {
	const { data: session, status } = useSession()
	const ph = usePostHog()

	useEffect(() => {
		if (!ph) {
			return
		}

		if (status === "authenticated" && session?.user) {
			ph.identify(session.user.id, {
				email: session.user.email ?? undefined,
				name: session.user.name ?? undefined,
			})
		}

		if (status === "unauthenticated") {
			ph.reset()
		}
	}, [status, session, ph])

	return null
}

interface PostHogProviderProps {
	children: ReactNode
}

/**
 * Wraps the app with PostHog analytics context.
 * Handles pageview tracking, user identification, and session replays.
 */
const PostHogProvider = ({ children }: PostHogProviderProps) => {
	if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
		return <>{children}</>
	}

	return (
		<PHProvider client={posthog}>
			<Suspense fallback={null}>
				<PostHogPageview />
				<PostHogIdentify />
			</Suspense>
			{children}
		</PHProvider>
	)
}

export { PostHogProvider }
