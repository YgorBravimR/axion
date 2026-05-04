"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Users } from "lucide-react"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { fetchHawksCohortStats } from "@/app/actions/hawks-mentor"
import type { HawksCohortStats } from "@/lib/hawks/action-types"

const formatPct = (value: number) => `${(value * 100).toFixed(1)}%`
const formatPf = (value: number | null) =>
	value === null ? "—" : `${value.toFixed(2)}×`

const HawksCohortComparison = () => {
	const t = useTranslations("hawksMentor.cohort")
	const [stats, setStats] = useState<HawksCohortStats | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const result = await fetchHawksCohortStats()
			if (!mounted) return
			if (result.status === "success" && result.data) {
				setStats(result.data)
			}
			setLoading(false)
		}
		load()
		return () => {
			mounted = false
		}
	}, [])

	return (
		<Card id="hawks-cohort-comparison">
			<CardHeader>
				<div className="flex items-center gap-s-200">
					<Users className="text-acc-100 h-5 w-5" aria-hidden="true" />
					<CardTitle>{t("title")}</CardTitle>
				</div>
				<CardDescription>{t("description")}</CardDescription>
			</CardHeader>
			<CardContent>
				{loading ? (
					<div className="flex items-center gap-s-200 text-text-300 text-fs-200">
						<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
						{t("loading")}
					</div>
				) : !stats || stats.hawksAccounts === 0 ? (
					<p className="text-text-300 text-fs-200">{t("empty")}</p>
				) : (
					<div className="grid gap-m-300 sm:grid-cols-4">
						<div className="space-y-s-100 rounded-md border border-bg-300 bg-bg-200/40 p-m-300">
							<p className="text-text-300 text-fs-100 uppercase tracking-wide">
								{t("accounts")}
							</p>
							<p className="text-fs-500 font-mono font-semibold">
								{stats.hawksAccounts}
							</p>
						</div>
						<div className="space-y-s-100 rounded-md border border-bg-300 bg-bg-200/40 p-m-300">
							<p className="text-text-300 text-fs-100 uppercase tracking-wide">
								{t("trades")}
							</p>
							<p className="text-fs-500 font-mono font-semibold">
								{stats.tradesLast90}
							</p>
						</div>
						<div className="space-y-s-100 rounded-md border border-bg-300 bg-bg-200/40 p-m-300">
							<p className="text-text-300 text-fs-100 uppercase tracking-wide">
								{t("winRate")}
							</p>
							<p className="text-fs-500 font-mono font-semibold">
								{formatPct(stats.avgWinRate)}
							</p>
						</div>
						<div className="space-y-s-100 rounded-md border border-bg-300 bg-bg-200/40 p-m-300">
							<p className="text-text-300 text-fs-100 uppercase tracking-wide">
								{t("profitFactor")}
							</p>
							<p className="text-fs-500 font-mono font-semibold">
								{formatPf(stats.avgProfitFactor)}
							</p>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

export { HawksCohortComparison }
