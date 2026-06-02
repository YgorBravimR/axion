"use client"

import { memo } from "react"
import { useTranslations } from "next-intl"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet"
import { TIER_TONE } from "./backtest-tier-breakdown"
import type { BacktestTrade } from "@/types/backtest"

interface BacktestQualityDrawerProps {
	trade: BacktestTrade | null
	onOpenChange: (_open: boolean) => void
}

// Visual treatment for each contribution row, keyed by signal direction.
const SIGNAL_TONE: Record<"favor" | "penalty" | "neutral", string> = {
	favor: "text-trade-buy",
	penalty: "text-trade-sell",
	neutral: "text-txt-300",
}

const BacktestQualityDrawer = memo(
	({ trade, onOpenChange }: BacktestQualityDrawerProps) => {
		const t = useTranslations("backtest.qualityDrawer")
		const open = trade !== null
		const quality = trade?.quality

		return (
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent
					id="backtest-quality-drawer"
					side="right"
					className="p-m-400 space-y-m-400 w-full overflow-y-auto sm:max-w-md"
				>
					<SheetHeader>
						<SheetTitle>
							{trade ? t("title", { id: trade.id }) : t("titleEmpty")}
						</SheetTitle>
						<SheetDescription>
							{trade
								? `${trade.dayKey} · ${trade.direction.toUpperCase()} · ${trade.label}`
								: t("descriptionEmpty")}
						</SheetDescription>
					</SheetHeader>

					{quality ? (
						<>
							<div className="gap-s-300 grid grid-cols-2">
								<div className="space-y-s-100">
									<p className="text-tiny text-txt-300">{t("tier")}</p>
									<span
										className={`px-s-300 py-s-100 text-tiny inline-flex items-center rounded-full border font-mono font-medium ${TIER_TONE[quality.tier]}`}
									>
										{quality.tier}
									</span>
								</div>
								<div className="space-y-s-100">
									<p className="text-tiny text-txt-300">{t("score")}</p>
									<p
										className={`text-h3 font-mono font-semibold ${
											quality.score > 0
												? "text-trade-buy"
												: quality.score < 0
													? "text-trade-sell"
													: "text-txt-100"
										}`}
									>
										{quality.score > 0 ? "+" : ""}
										{quality.score}
									</p>
								</div>
							</div>

							<div>
								<h4 className="text-small text-txt-100 mb-s-200 font-medium">
									{t("contributions")}
								</h4>
								{quality.contributions.length === 0 ? (
									<p className="text-small text-txt-300">{t("noRules")}</p>
								) : (
									<ul className="space-y-s-200">
										{quality.contributions.map((c) => (
											<li
												key={c.key}
												className="border-bg-300 bg-bg-100 p-s-300 gap-s-300 flex items-center justify-between rounded-sm border"
											>
												<div className="min-w-0">
													<p className="text-small text-txt-100 truncate font-mono">
														{c.key}
													</p>
													<p className={`text-tiny ${SIGNAL_TONE[c.signal]}`}>
														{t(`signal.${c.signal}`)} · w {c.weight}
													</p>
												</div>
												<span
													className={`text-small font-mono font-semibold ${
														c.contribution > 0
															? "text-trade-buy"
															: c.contribution < 0
																? "text-trade-sell"
																: "text-txt-300"
													}`}
												>
													{c.contribution > 0 ? "+" : ""}
													{c.contribution}
												</span>
											</li>
										))}
									</ul>
								)}
							</div>
						</>
					) : (
						<p className="text-small text-txt-300">{t("noQuality")}</p>
					)}
				</SheetContent>
			</Sheet>
		)
	}
)
BacktestQualityDrawer.displayName = "BacktestQualityDrawer"

export { BacktestQualityDrawer }
