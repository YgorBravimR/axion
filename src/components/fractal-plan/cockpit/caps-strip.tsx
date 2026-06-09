import { getTranslations, getLocale } from "next-intl/server"
import { formatCurrency } from "@/lib/formatting"
import type { Locale } from "@/i18n/config"
import { RCapOverridePopover } from "@/components/fractal-plan/r-cap-override-popover"
import type { CascadeLevel } from "@/lib/fractal-plan/cascade-merge"

interface ResolvedField {
	value: string
	source: CascadeLevel
}

interface CapsStripProps {
	monthlyPlanId: string
	tierIndex: number
	oneRCents: number
	capitalCents: number
	dailyLossR: ResolvedField
	dailyTargetR: ResolvedField
	weeklyLossR: ResolvedField
	monthlyLossR: ResolvedField
}

const CapsStrip = async ({
	monthlyPlanId,
	tierIndex,
	oneRCents,
	capitalCents,
	dailyLossR,
	dailyTargetR,
	weeklyLossR,
	monthlyLossR,
}: CapsStripProps) => {
	const t = await getTranslations("plan.capsStrip")
	const locale = (await getLocale()) as Locale
	const formatBRL = (cents: number): string =>
		formatCurrency(
			cents / 100,
			locale,
			locale === "pt-BR" ? "BRL" : "USD"
		).replace(/[,.]\d{2}$/, "")

	return (
		<section
			id="month-caps-strip"
			className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border"
			aria-label={t("ariaLabel")}
		>
			<div className="gap-x-m-500 gap-y-s-300 flex flex-wrap items-baseline">
				<div className="gap-s-300 flex items-baseline">
					<span className="text-tiny text-txt-300 tracking-wide uppercase">
						Tier
					</span>
					<span className="text-h3 text-acc-100 font-mono font-semibold">
						T{tierIndex}
					</span>
				</div>
				<div className="gap-s-300 flex items-baseline">
					<span className="text-tiny text-txt-300 tracking-wide uppercase">
						1R
					</span>
					<span className="text-h3 text-txt-100 font-mono tabular-nums">
						{formatBRL(oneRCents)}
					</span>
				</div>
				<div className="gap-s-300 flex items-baseline">
					<span className="text-tiny text-txt-300 tracking-wide uppercase">
						Capital
					</span>
					<span className="text-h3 text-txt-100 font-mono tabular-nums">
						{formatBRL(capitalCents)}
					</span>
				</div>

				<div className="gap-x-m-400 gap-y-s-200 ml-auto flex flex-wrap items-center">
					<div className="gap-s-200 flex items-center">
						<span className="text-tiny text-txt-300 tracking-wide uppercase">
							{t("dailyLT")}
						</span>
						<RCapOverridePopover
							level="month"
							planRowId={monthlyPlanId}
							fieldKey="overrideDailyLossR"
							fieldLabel="daily loss R"
							currentValue={dailyLossR.value}
							currentSource={dailyLossR.source}
							idPrefix="m-cap-daily-loss"
						/>
						<span className="text-txt-300">/</span>
						<RCapOverridePopover
							level="month"
							planRowId={monthlyPlanId}
							fieldKey="overrideDailyTargetR"
							fieldLabel="daily target R"
							currentValue={dailyTargetR.value}
							currentSource={dailyTargetR.source}
							idPrefix="m-cap-daily-target"
						/>
					</div>
					<div className="gap-s-200 flex items-center">
						<span className="text-tiny text-txt-300 tracking-wide uppercase">
							{t("weekly")}
						</span>
						<RCapOverridePopover
							level="month"
							planRowId={monthlyPlanId}
							fieldKey="overrideWeeklyLossR"
							fieldLabel="weekly loss R"
							currentValue={weeklyLossR.value}
							currentSource={weeklyLossR.source}
							idPrefix="m-cap-weekly-loss"
						/>
					</div>
					<div className="gap-s-200 flex items-center">
						<span className="text-tiny text-txt-300 tracking-wide uppercase">
							{t("monthly")}
						</span>
						<RCapOverridePopover
							level="month"
							planRowId={monthlyPlanId}
							fieldKey="overrideMonthlyLossR"
							fieldLabel="monthly loss R"
							currentValue={monthlyLossR.value}
							currentSource={monthlyLossR.source}
							idPrefix="m-cap-monthly-loss"
						/>
					</div>
				</div>
			</div>
		</section>
	)
}

export { CapsStrip }
export type { CapsStripProps }
