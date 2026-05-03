"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Crosshair, Loader2 } from "lucide-react"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import {
	disableHawksMode,
	enableHawksMode,
	fetchHawksMode,
	type HawksModeStatus,
} from "@/app/actions/hawks-mode"

const HawksModeSettings = () => {
	const t = useTranslations("settings.mode")
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [isLoading, setIsLoading] = useState(true)
	const [status, setStatus] = useState<HawksModeStatus | null>(null)

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const result = await fetchHawksMode()
			if (!mounted) return
			if (result.status === "success" && result.data) {
				setStatus(result.data)
			}
			setIsLoading(false)
		}
		load()
		return () => {
			mounted = false
		}
	}, [])

	const handleToggle = (checked: boolean) => {
		startTransition(async () => {
			const result = checked ? await enableHawksMode() : await disableHawksMode()
			if (result.status === "success" && result.data) {
				setStatus(result.data)
				showToast("success", result.message)
				router.refresh()
				return
			}
			showToast("error", result.message)
		})
	}

	const isHawks = status?.mode === "hawks"

	return (
		<div className="space-y-m-500">
			<Card id="hawks-mode-toggle-card">
				<CardHeader className="flex flex-row items-start justify-between gap-m-300">
					<div className="space-y-s-200">
						<div className="flex items-center gap-s-200">
							<Crosshair className="text-acc-100 h-5 w-5" aria-hidden="true" />
							<CardTitle>{t("hawks.title")}</CardTitle>
						</div>
						<CardDescription>{t("hawks.description")}</CardDescription>
					</div>
					<div className="flex items-center gap-s-200 shrink-0">
						{(isLoading || isPending) && (
							<Loader2 className="text-text-200 h-4 w-4 animate-spin" aria-hidden="true" />
						)}
						<Switch
							id="hawks-mode-toggle"
							checked={isHawks}
							onCheckedChange={handleToggle}
							disabled={isLoading || isPending}
							aria-label={t("hawks.toggleAria")}
						/>
					</div>
				</CardHeader>
				<CardContent className="text-text-200 text-fs-200 space-y-s-300">
					<p>{t("hawks.body")}</p>
					{isHawks && (
						<div className="border-acc-100/40 bg-acc-100/5 text-acc-100 rounded-md border p-m-300 text-fs-200">
							<p className="font-medium">{t("hawks.activeBanner")}</p>
						</div>
					)}
					<p className="text-text-300 text-fs-100">{t("hawks.scopeNote")}</p>
				</CardContent>
			</Card>

			<Card id="hawks-mode-preview-card">
				<CardHeader>
					<CardTitle>{t("hawks.previewTitle")}</CardTitle>
					<CardDescription>{t("hawks.previewDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-s-200">
					{isHawks ? (
						<>
							<Button id="hawks-mode-preview-bias" variant="outline" asChild>
								<Link href="/hawks/bias">{t("hawks.openBias")}</Link>
							</Button>
							<Button id="hawks-mode-preview-calibration" variant="outline" asChild>
								<Link href="/hawks/calibration">{t("hawks.openCalibration")}</Link>
							</Button>
							<Button id="hawks-mode-preview-calendar" variant="outline" asChild>
								<Link href="/hawks/calendar">{t("hawks.openCalendar")}</Link>
							</Button>
							<Button id="hawks-mode-preview-analytics" variant="outline" asChild>
								<Link href="/hawks/analytics">{t("hawks.openAnalytics")}</Link>
							</Button>
							<Button id="hawks-mode-preview-presets" variant="outline" asChild>
								<Link href="/hawks/presets">{t("hawks.openPresets")}</Link>
							</Button>
							<Button id="hawks-mode-preview-learning" variant="outline" asChild>
								<Link href="/hawks/learning">{t("hawks.openLearning")}</Link>
							</Button>
							<Button id="hawks-mode-preview-mentor" variant="outline" asChild>
								<Link href="/hawks/mentor">{t("hawks.openMentor")}</Link>
							</Button>
						</>
					) : (
						<Button id="hawks-mode-preview-button" variant="outline" disabled>
							{t("hawks.previewButton")}
						</Button>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

export { HawksModeSettings }
