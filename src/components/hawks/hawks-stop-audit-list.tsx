"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchHawksStopAudit } from "@/app/actions/hawks-stop-audit"
import type { StopAuditRecord } from "@/lib/hawks/stop-audit"
import { cn } from "@/lib/utils"

interface HawksStopAuditListProps {
	tradeId: string
}

const HawksStopAuditList = ({ tradeId }: HawksStopAuditListProps) => {
	const t = useTranslations("hawksStopAudit.list")
	const [rows, setRows] = useState<StopAuditRecord[]>([])
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const result = await fetchHawksStopAudit(tradeId)
			if (!mounted) return
			if (result.status === "success" && result.data) {
				setRows(result.data)
			}
			setIsLoading(false)
		}
		load()
		return () => {
			mounted = false
		}
	}, [tradeId])

	const violations = rows.filter((row) => row.violation).length

	return (
		<Card id="hawks-stop-audit-list">
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
				<CardDescription>{t("description")}</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-text-300 text-small">{t("loading")}</p>
				) : rows.length === 0 ? (
					<p className="text-text-300 text-small">{t("empty")}</p>
				) : (
					<div className="space-y-s-200">
						<div className="flex items-center gap-s-200 text-small">
							{violations === 0 ? (
								<ShieldCheck className="text-acc-100 h-4 w-4" aria-hidden="true" />
							) : (
								<AlertTriangle className="text-loss h-4 w-4" aria-hidden="true" />
							)}
							<span>
								{violations === 0
									? t("disciplineClean")
									: t("disciplineViolations", { count: violations })}
							</span>
						</div>
						<ul className="divide-bg-300 divide-y">
							{rows.map((row) => (
								<li
									key={row.id}
									className={cn(
										"flex items-start justify-between gap-m-400 py-s-300 text-small",
										row.violation && "text-loss"
									)}
								>
									<div className="space-y-s-100">
										<p className="font-medium">
											{t("change", { old: row.oldStop ?? "—", new: row.newStop })}
										</p>
										<p className="text-text-300 text-tiny">
											{t("direction", { direction: row.direction })} ·{" "}
											{new Date(row.changedAt).toLocaleString()}
										</p>
									</div>
									{row.violation && (
										<span className="border-loss/40 bg-loss/10 text-loss rounded-full border px-s-200 text-tiny font-medium">
											{t("violation")}
										</span>
									)}
								</li>
							))}
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

export { HawksStopAuditList }
export type { HawksStopAuditListProps }
