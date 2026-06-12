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
			className="border-bg-300 bg-bg-200 rounded-lg border"
			aria-label={t("ariaLabel")}
		>
			<div className="p-m-400 gap-x-m-500 gap-y-s-300 flex flex-wrap items-end">
				{/* Hero: month-start capital — the anchor of everything else */}
				<div className="gap-s-100 flex flex-col">
					<span className="text-tiny text-txt-300 tracking-wide uppercase">
						{t("monthStartCapital")}
					</span>
					<span className="text-h2 text-txt-100 font-mono leading-none tabular-nums">
						{formatBRL(capitalCents)}
					</span>
				</div>

				{/* Tier / 1R — secondary stats that derive from capital */}
				<div className="border-bg-300 pl-m-400 gap-m-400 flex items-end border-l">
					<div className="gap-s-100 flex flex-col">
						<span className="text-tiny text-txt-300 tracking-wide uppercase">
							Tier
						</span>
						<span className="text-h3 text-acc-100 font-mono leading-none font-semibold">
							T{tierIndex}
						</span>
					</div>
					<div className="gap-s-100 flex flex-col">
						<span className="text-tiny text-txt-300 tracking-wide uppercase">
							1R
						</span>
						<span className="text-h3 text-txt-100 font-mono leading-none tabular-nums">
							{formatBRL(oneRCents)}
						</span>
					</div>
				</div>

				{/* Risk caps — separate cluster, pushed to the right */}
				<div className="border-bg-300 pl-m-400 gap-m-400 ml-auto flex items-end border-l">
					<div className="gap-s-100 flex flex-col">
						<span className="text-tiny text-txt-300 tracking-wide uppercase">
							{t("dailyLT")}
						</span>
						<div className="gap-s-100 flex items-center leading-none">
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
					</div>
					<div className="gap-s-100 flex flex-col">
						<span className="text-tiny text-txt-300 tracking-wide uppercase">
							{t("weekly")}
						</span>
						<div className="leading-none">
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
					</div>
					<div className="gap-s-100 flex flex-col">
						<span className="text-tiny text-txt-300 tracking-wide uppercase">
							{t("monthly")}
						</span>
						<div className="leading-none">
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
			</div>
		</section>
	)
}

export { CapsStrip }
export type { CapsStripProps }
