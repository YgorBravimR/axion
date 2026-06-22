import { AlertTriangle, Clock } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { getDarfAlertSummary } from "@/app/actions/tax-engine"

const formatCents = (cents: number, locale: string): string => {
	const value = cents / 100
	return new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {
		style: "currency",
		currency: "BRL",
		minimumFractionDigits: 2,
	}).format(value)
}

interface DarfAlertBannerProps {
	accountId: string
	locale: string
}

export const DarfAlertBanner = async ({
	accountId,
	locale,
}: DarfAlertBannerProps) => {
	const t = await getTranslations("reports.darfAlert")
	const result = await getDarfAlertSummary({ accountId })

	if (result.status !== "success" || !result.data) {
		return null
	}

	const { overdueCount, pendingCount, overdueTotalCents, pendingTotalCents } =
		result.data

	if (overdueCount === 0 && pendingCount === 0) {
		return null
	}

	const hasOverdue = overdueCount > 0

	return (
		<div
			className={`p-m-400 gap-s-300 flex items-start rounded-lg border ${
				hasOverdue
					? "border-destructive/40 bg-destructive/5"
					: "border-warning/40 bg-warning/5"
			}`}
			role="status"
			aria-live="polite"
		>
			{hasOverdue ? (
				<AlertTriangle
					className="text-destructive mt-0.5 h-5 w-5 shrink-0"
					aria-hidden="true"
				/>
			) : (
				<Clock
					className="text-warning mt-0.5 h-5 w-5 shrink-0"
					aria-hidden="true"
				/>
			)}
			<div className="gap-s-200 flex flex-1 flex-col">
				<div
					className={`text-small font-semibold ${
						hasOverdue ? "text-destructive" : "text-warning"
					}`}
				>
					{hasOverdue
						? t("overdueTitle", { count: overdueCount })
						: t("pendingTitle", { count: pendingCount })}
				</div>
				<div className="text-small text-txt-200 space-y-s-100">
					{overdueCount > 0 && (
						<div>
							{t("overdueDetail", {
								count: overdueCount,
								amount: formatCents(overdueTotalCents, locale),
							})}
						</div>
					)}
					{pendingCount > 0 && (
						<div>
							{t("pendingDetail", {
								count: pendingCount,
								amount: formatCents(pendingTotalCents, locale),
							})}
						</div>
					)}
					<div className="text-tiny text-txt-300">{t("filingHint")}</div>
				</div>
			</div>
		</div>
	)
}
