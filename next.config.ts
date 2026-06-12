import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const securityHeaders = [
	{
		key: "Strict-Transport-Security",
		value: "max-age=63072000; includeSubDomains; preload",
	},
	{ key: "X-Frame-Options", value: "SAMEORIGIN" },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{
		key: "Permissions-Policy",
		value: "camera=(), microphone=(), geolocation=()",
	},
	{
		key: "Content-Security-Policy",
		value: [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: blob: https:",
			"font-src 'self' data:",
			"connect-src 'self' https:",
			"frame-ancestors 'self'",
		].join("; "),
	},
]

const nextConfig: NextConfig = {
	poweredByHeader: false,
	// Prevent turbopack from bundling native/Node.js-only modules.
	// bcryptjs depends on Node.js built-ins that must be resolved at runtime.
	// Both @duckdb packages are listed explicitly — externalization does NOT
	// cascade transitively in Turbopack, so the binding-shim layer (which
	// `require()`s platform-specific .node files) gets bundled and fails on
	// missing non-host platforms unless listed by name.
	serverExternalPackages: [
		"bcryptjs",
		"@duckdb/node-api",
		"@duckdb/node-bindings",
	],
	// Force Vercel's file tracer to ship libduckdb.so (the 67MB native shared
	// library) alongside duckdb.node into the serverless function bundle.
	// Without this, only duckdb.node is traced; dlopen at cold-start fails with
	// `libduckdb.so: cannot open shared object file`. The globs target the
	// pnpm store paths directly — the platform packages live there as
	// optionalDependencies of the @duckdb/node-bindings umbrella, NOT as
	// top-level deps (which would cause a symlink clash on Vercel re-install).
	outputFileTracingIncludes: {
		"/**/*": [
			"./node_modules/.pnpm/@duckdb+node-bindings-linux-x64@*/node_modules/@duckdb/node-bindings-linux-x64/**",
			"./node_modules/.pnpm/@duckdb+node-bindings-linux-arm64@*/node_modules/@duckdb/node-bindings-linux-arm64/**",
			"./node_modules/.pnpm/@duckdb+node-bindings-linux-x64-musl@*/node_modules/@duckdb/node-bindings-linux-x64-musl/**",
			"./node_modules/.pnpm/@duckdb+node-bindings-linux-arm64-musl@*/node_modules/@duckdb/node-bindings-linux-arm64-musl/**",
		],
	},
	// Enable "use cache" directive + cacheTag/cacheLife for server-side caching
	cacheComponents: true,
	experimental: {
		// 5m Renko CSVs can exceed 1MB — raise limit for candle import uploads
		serverActions: {
			bodySizeLimit: "5mb",
		},
		// Optimize package imports for better tree-shaking and faster dev boot
		// recharts: ~300KB, lucide-react: ~2.8s dev cost without optimization
		optimizePackageImports: ["recharts", "lucide-react"],
		// Use worker threads instead of forked child processes for static path
		// generation. Child process fork() fails with EBADF when the parent
		// process has closed file descriptors (e.g. in CI or shell-less runners).
		// Worker threads share the parent's open FDs and avoid the spawn error.
		workerThreads: true,
	},
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: securityHeaders,
			},
		]
	},
	// Proxy PostHog traffic through our domain — bypasses ad blockers, no CSP changes needed
	async rewrites() {
		return [
			{
				source: "/ingest/static/:path*",
				destination: "https://us-assets.i.posthog.com/static/:path*",
			},
			{
				source: "/ingest/:path*",
				destination: "https://us.i.posthog.com/:path*",
			},
		]
	},
}

export default withSentryConfig(withNextIntl(nextConfig), {
	// Proxy Sentry traffic through our domain — bypasses ad blockers, no CSP changes needed
	tunnelRoute: "/monitoring",

	// Upload source maps then delete from public build (default: true in v10)
	sourcemaps: {
		deleteSourcemapsAfterUpload: true,
	},

	// Suppress noisy Sentry build logs
	silent: true,

	// Tree-shake Sentry debug code and skip Vercel Cron Monitors (paid feature)
	bundleSizeOptimizations: {
		excludeDebugStatements: true,
	},
})
