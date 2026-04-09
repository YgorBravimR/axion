"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { useTranslations } from "next-intl"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

/**
 * Error boundary for main dashboard.
 * Shows a generic error message to prevent leaking internal error details to users.
 * The error digest (a safe hash) is shown for support reference.
 *
 * This component lives inside the [locale] layout, so next-intl providers are available.
 */
const Error = (props: {
	error: Error & { digest?: string }
	reset: () => void
}) => {
	const { error, reset } = props
	const t = useTranslations("errors.boundary")

	useEffect(() => {
		Sentry.captureException(error)
	}, [error])

	return (
		<div className="bg-bg-100 p-m-400 flex min-h-dvh items-center justify-center sm:p-m-600">
			<Card id="error-boundary-card" className="bg-bg-200 p-m-500 max-w-lg shadow-xl sm:p-l-700">
				<div className="flex flex-col items-center text-center">
					<div className="bg-fb-error/20 p-m-600 rounded-full">
						<AlertTriangle className="text-fb-error h-12 w-12" />
					</div>

					<h1 className="mt-m-600 text-h2 text-txt-100 font-bold">
						{t("title")}
					</h1>

					<p className="mt-m-400 text-body text-txt-200">
						{t("description")}
					</p>

					{error.digest && (
						<div className="mt-m-500 bg-bg-300 p-m-400 w-full rounded-lg">
							<p className="text-small text-txt-300">
								{t("reference", { digest: error.digest })}
							</p>
						</div>
					)}

					<div className="mt-l-700 gap-m-400 flex">
						<Button
						id="error-try-again"
							onClick={reset}
							className="bg-acc-100 text-bg-100 hover:bg-acc-100/90"
							type="button"
						>
							{t("tryAgain")}
						</Button>
						<Button id="error-reload-page" variant="ghost" onClick={() => window.location.reload()}>
							{t("reloadPage")}
						</Button>
					</div>
				</div>
			</Card>
		</div>
	)
}

export default Error
