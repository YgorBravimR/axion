/**
 * Lightweight capture utility for console errors/warnings and failed network requests.
 * Buffers the last 50 entries of each type with circular buffering (~100KB max).
 *
 * Usage: Call `initCapture()` once (from a client-side provider),
 * then `getConsoleLogs()` / `getNetworkErrors()` when submitting a bug report.
 */

const MAX_ENTRIES = 50

interface ConsoleEntry {
	level: "error" | "warn"
	message: string
	stack?: string
	timestamp: string
}

interface NetworkEntry {
	url: string
	status: number
	method: string
	timestamp: string
}

let consoleBuffer: ConsoleEntry[] = []
let networkBuffer: NetworkEntry[] = []
let initialized = false

const pushToBuffer = <T>(buffer: T[], entry: T): T[] => {
	buffer.push(entry)
	if (buffer.length > MAX_ENTRIES) buffer.shift()
	return buffer
}

const initCapture = () => {
	if (initialized || typeof window === "undefined") return

	initialized = true

	// Monkey-patch console.error and console.warn
	const originalError = console.error
	const originalWarn = console.warn

	console.error = (...args: unknown[]) => {
		const message = args.map(String).join(" ")
		const stack = new Error().stack
		consoleBuffer = pushToBuffer(consoleBuffer, {
			level: "error",
			message,
			stack,
			timestamp: new Date().toISOString(),
		})
		originalError.apply(console, args)
	}

	console.warn = (...args: unknown[]) => {
		const message = args.map(String).join(" ")
		consoleBuffer = pushToBuffer(consoleBuffer, {
			level: "warn",
			message,
			timestamp: new Date().toISOString(),
		})
		originalWarn.apply(console, args)
	}

	// Capture uncaught errors
	window.addEventListener("error", (event) => {
		consoleBuffer = pushToBuffer(consoleBuffer, {
			level: "error",
			message: event.message,
			stack: event.error?.stack,
			timestamp: new Date().toISOString(),
		})
	})

	// Capture unhandled promise rejections
	window.addEventListener("unhandledrejection", (event) => {
		consoleBuffer = pushToBuffer(consoleBuffer, {
			level: "error",
			message: `Unhandled rejection: ${String(event.reason)}`,
			stack: event.reason?.stack,
			timestamp: new Date().toISOString(),
		})
	})

	// Use PerformanceObserver to detect failed network requests
	if (typeof PerformanceObserver !== "undefined") {
		try {
			const observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					// @see https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus
					const resource = entry as PerformanceResourceTiming & {
						responseStatus?: number
					}
					const status = resource.responseStatus
					if (status && status >= 400) {
						networkBuffer = pushToBuffer(networkBuffer, {
							url: resource.name,
							status,
							method: "GET", // PerformanceObserver doesn't expose method
							timestamp: new Date().toISOString(),
						})
					}
				}
			})
			observer.observe({ type: "resource", buffered: false })
		} catch {
			// PerformanceObserver not supported — silently skip
		}
	}
}

const getConsoleLogs = (): string =>
	consoleBuffer.length > 0 ? JSON.stringify(consoleBuffer) : ""

const getNetworkErrors = (): string =>
	networkBuffer.length > 0 ? JSON.stringify(networkBuffer) : ""

const clearCapture = () => {
	consoleBuffer = []
	networkBuffer = []
}

export { initCapture, getConsoleLogs, getNetworkErrors, clearCapture }
export type { ConsoleEntry, NetworkEntry }
