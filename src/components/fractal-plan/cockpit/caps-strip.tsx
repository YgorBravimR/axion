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

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

const CapsStrip = ({
	monthlyPlanId,
	tierIndex,
	oneRCents,
	capitalCents,
	dailyLossR,
	dailyTargetR,
	weeklyLossR,
	monthlyLossR,
}: CapsStripProps) => {
	return (
		<section
			id="month-caps-strip"
			className="rounded-lg border border-bg-300 bg-bg-200 p-m-400"
			aria-label="Tier e caps de risco"
		>
			<div className="flex flex-wrap items-baseline gap-x-m-500 gap-y-s-300">
				<div className="flex items-baseline gap-s-300">
					<span className="text-tiny uppercase tracking-wide text-txt-300">Tier</span>
					<span className="font-mono text-h3 font-semibold text-acc-100">T{tierIndex}</span>
				</div>
				<div className="flex items-baseline gap-s-300">
					<span className="text-tiny uppercase tracking-wide text-txt-300">1R</span>
					<span className="font-mono text-h3 tabular-nums text-txt-100">{formatBRL(oneRCents)}</span>
				</div>
				<div className="flex items-baseline gap-s-300">
					<span className="text-tiny uppercase tracking-wide text-txt-300">Capital</span>
					<span className="font-mono text-h3 tabular-nums text-txt-100">{formatBRL(capitalCents)}</span>
				</div>

				<div className="ml-auto flex flex-wrap items-center gap-x-m-400 gap-y-s-200">
					<div className="flex items-center gap-s-200">
						<span className="text-tiny uppercase tracking-wide text-txt-300">Diário L/T</span>
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
					<div className="flex items-center gap-s-200">
						<span className="text-tiny uppercase tracking-wide text-txt-300">Semanal</span>
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
					<div className="flex items-center gap-s-200">
						<span className="text-tiny uppercase tracking-wide text-txt-300">Mensal</span>
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
