/**
 * Sentry client-side configuration.
 * Next.js 16 loads this file automatically on the client via the instrumentation-client convention.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
import * as Sentry from "@sentry/nextjs"
import { shouldIgnore } from "@/lib/sentry"

// Per-error dedup: after N events of the same error in one page session,
// drop subsequent events. This caps both error quota AND replay quota
// since Sentry only sends a replay when beforeSend returns the event.
// Sentry already groups duplicates into one issue, so we lose nothing.
const MAX_EVENTS_PER_ERROR = 3
const errorEventCounts = new Map<string, number>()

// Required by Next.js 16 — instruments client-side navigations for Sentry tracing
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

	// Only enable in production to avoid noise during development
	enabled: process.env.NODE_ENV === "production",

	// Separate production from preview deploys in Sentry dashboard
	environment: process.env.NODE_ENV,

	// --- Quota management (free tier: 5K errors/month) ---

	// Send all real errors — they're our highest-value signal
	sampleRate: 1.0,

	// Performance: sample 10% of transactions (free tier: 10K/month)
	tracesSampleRate: 0.1,

	// Replay: only on errors — see exactly what the user did before the crash (free tier: 50/month)
	// Normal session replays disabled (PostHog handles general analytics/replays)
	replaysSessionSampleRate: 0,
	replaysOnErrorSampleRate: 1.0,

	integrations: [
		Sentry.replayIntegration({
			maskAllText: true,
			blockAllMedia: true,
		}),
		Sentry.browserTracingIntegration(),
	],

	// Drop ignored errors + cap repeated errors to MAX_EVENTS_PER_ERROR per page session.
	// Dropping the event also prevents the replay from being sent for that error.
	beforeSend(event) {
		const message = event.exception?.values?.[0]?.value ?? ""
		if (shouldIgnore(new Error(message))) {
			return null
		}

		// Cap repeated identical errors: first 3 get full error + replay, rest are dropped
		const count = errorEventCounts.get(message) ?? 0
		errorEventCounts.set(message, count + 1)
		if (count >= MAX_EVENTS_PER_ERROR) {
			return null
		}

		return event
	},

	// Strip sensitive data from breadcrumbs
	beforeBreadcrumb(breadcrumb) {
		// Don't send console.log breadcrumbs (noisy)
		if (breadcrumb.category === "console" && breadcrumb.level !== "error") {
			return null
		}
		return breadcrumb
	},
})
