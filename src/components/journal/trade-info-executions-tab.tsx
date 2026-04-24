"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { TradeChartData } from "@/types/candle"
import { APP_TIMEZONE } from "@/lib/dates"

// M5: Hoisted to module scope — avoid re-instantiating on every render inside .map()
const executionTimeFormatter = new Intl.DateTimeFormat("en-GB", {
	timeZone: APP_TIMEZONE,
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
})

interface TradeInfoExecutionsTabProps {
	trade: TradeChartData["trade"]
	executions: TradeChartData["executions"]
}

const TradeInfoExecutionsTab = ({ trade, executions }: TradeInfoExecutionsTabProps) => {
	const tTrade = useTranslations("trade")
	const tCommon = useTranslations("common")

	const isLong = trade.direction === "long"

	if (executions.length > 0) {
		return (
			<div className="space-y-s-200">
				{/* Header row */}
				<div className="text-tiny text-txt-300 grid grid-cols-4 gap-s-200 font-medium">
					<span>{tCommon("type")}</span>
					<span>{tCommon("price")}</span>
					<span>{tCommon("qty")}</span>
					<span>{tCommon("time")}</span>
				</div>
				<Separator id="panel-separator-exec-header" />

				{executions.map((exec, index) => {
					const isBuy = isLong
						? exec.type === "entry"
						: exec.type === "exit"
					const timeStr = executionTimeFormatter.format(new Date(exec.timestamp))

					return (
						<div
							key={`exec-${exec.type}-${exec.price}-${exec.quantity}-${index}`}
							className="text-small grid grid-cols-4 gap-s-200 py-s-100"
						>
							<Badge
								id={`panel-exec-badge-${index}`}
								variant="outline"
								className={cn(
									"w-fit text-tiny",
									isBuy
										? "border-action-buy/30 text-action-buy"
										: "border-action-sell/30 text-action-sell"
								)}
							>
								{exec.type === "entry" ? tTrade("entry") : tTrade("exit")}
							</Badge>
							<span className="text-txt-100 font-medium">
								{exec.price.toFixed(2)}
							</span>
							<span className="text-txt-100">x{exec.quantity}</span>
							<span className="text-txt-300">{timeStr}</span>
						</div>
					)
				})}
			</div>
		)
	}

	return (
		<div className="space-y-s-200">
			{/* Simple entry/exit for non-scaled trades */}
			<div className="text-tiny text-txt-300 grid grid-cols-3 gap-s-200 font-medium">
				<span>{tCommon("type")}</span>
				<span>{tCommon("price")}</span>
				<span>{tCommon("qty")}</span>
			</div>
			<Separator id="panel-separator-simple-exec-header" />
			<div className="text-small grid grid-cols-3 gap-s-200 py-s-100">
				<Badge
					id="panel-simple-entry-badge"
					variant="outline"
					className="border-action-buy/30 text-action-buy w-fit text-tiny"
				>
					{tTrade("entry")}
				</Badge>
				<span className="text-txt-100 font-medium">
					{Number(trade.entryPrice).toFixed(2)}
				</span>
				<span className="text-txt-100">x{trade.positionSize}</span>
			</div>
			{trade.exitPrice !== null && (
				<div className="text-small grid grid-cols-3 gap-s-200 py-s-100">
					<Badge
						id="panel-simple-exit-badge"
						variant="outline"
						className="border-action-sell/30 text-action-sell w-fit text-tiny"
					>
						{tTrade("exit")}
					</Badge>
					<span className="text-txt-100 font-medium">
						{Number(trade.exitPrice).toFixed(2)}
					</span>
					<span className="text-txt-100">x{trade.positionSize}</span>
				</div>
			)}
		</div>
	)
}

export type { TradeInfoExecutionsTabProps }
export { TradeInfoExecutionsTab }
