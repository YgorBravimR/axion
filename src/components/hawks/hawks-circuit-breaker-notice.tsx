import { AlertTriangle, Crosshair } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { getCurrentAccount } from "@/app/actions/auth"
import { getHawksCircuitBreakerState } from "@/lib/hawks/circuit-breaker"
import { cn } from "@/lib/utils"

interface HawksCircuitBreakerNoticeProps {
	className?: string
}

const HawksCircuitBreakerNotice = async ({
	className,
}: HawksCircuitBreakerNoticeProps) => {
	const account = await getCurrentAccount()
	if (!account) return null

	const state = await getHawksCircuitBreakerState({ accountId: account.id })
	if (!state.hawksActive) return null

	const t = await getTranslations("hawksCircuitBreaker")
	const Icon = state.exceeded ? AlertTriangle : Crosshair

	return (
		<div
			role={state.exceeded ? "alert" : "status"}
			className={cn(
				"flex items-start gap-s-300 rounded-md border p-m-300 text-fs-200",
				state.exceeded
					? "border-loss/40 bg-loss/10 text-loss"
					: "border-acc-100/40 bg-acc-100/5 text-acc-100",
				className
			)}
		>
			<Icon className="mt-s-050 h-4 w-4 shrink-0" aria-hidden="true" />
			<div className="space-y-s-100">
				<p className="font-medium">
					{state.exceeded
						? t("exceededTitle")
						: t("activeTitle", { count: state.tradeCount, limit: state.limit })}
				</p>
				<p className="text-fs-100 opacity-80">
					{state.exceeded ? t("exceededBody") : t("activeBody")}
				</p>
			</div>
		</div>
	)
}

export { HawksCircuitBreakerNotice }
