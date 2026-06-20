"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, RotateCcw, Save, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { useToast } from "@/components/ui/toast"
import {
	upsertMonthlyPlan,
	resetMonthlyOverride,
} from "@/app/actions/fractal-plan/monthly"
import {
	upsertWeeklyPlan,
	resetWeeklyOverride,
} from "@/app/actions/fractal-plan/weekly"
import {
	upsertDailyPlan,
	resetDailyOverride,
} from "@/app/actions/fractal-plan/daily"
import { ProvenanceBadge } from "./provenance-badge"
import type { CascadeLevel } from "@/lib/fractal-plan/cascade-merge"

type Level = "month" | "week" | "day"

type FieldKey =
	| "overrideDailyLossR"
	| "overrideDailyTargetR"
	| "overrideWeeklyLossR"
	| "overrideMonthlyLossR"

interface RCapOverridePopoverProps {
	level: Level
	planRowId: string
	fieldKey: FieldKey
	fieldLabel: string
	currentValue: string | null
	currentSource: CascadeLevel
	idPrefix: string
}

const formatR = (v: string | null): string => {
	if (v === null) {
		return "—"
	}
	const n = Number(v)
	return Number.isFinite(n) ? `${n.toFixed(2)}R` : "—"
}

const callUpsert = async (
	level: Level,
	planRowId: string,
	fieldKey: FieldKey,
	value: number
) => {
	if (level === "month") {
		return upsertMonthlyPlan({ monthlyPlanId: planRowId, [fieldKey]: value })
	}
	if (level === "week") {
		if (fieldKey === "overrideMonthlyLossR") {
			return {
				status: "error" as const,
				message: "monthlyLossR not overridable at week level",
			}
		}
		return upsertWeeklyPlan({ weeklyPlanId: planRowId, [fieldKey]: value })
	}
	if (
		fieldKey === "overrideWeeklyLossR" ||
		fieldKey === "overrideMonthlyLossR"
	) {
		return {
			status: "error" as const,
			message: `${fieldKey} not overridable at day level`,
		}
	}
	return upsertDailyPlan({ dailyPlanId: planRowId, [fieldKey]: value })
}

const callReset = async (
	level: Level,
	planRowId: string,
	fieldKey: FieldKey
) => {
	if (level === "month") {
		return resetMonthlyOverride({
			monthlyPlanId: planRowId,
			field: fieldKey as
				| "overrideDailyLossR"
				| "overrideWeeklyLossR"
				| "overrideMonthlyLossR"
				| "overrideDailyTargetR",
		})
	}
	if (level === "week") {
		return resetWeeklyOverride({
			weeklyPlanId: planRowId,
			field: fieldKey as
				| "overrideDailyLossR"
				| "overrideWeeklyLossR"
				| "overrideDailyTargetR",
		})
	}
	return resetDailyOverride({
		dailyPlanId: planRowId,
		field: fieldKey as "overrideDailyLossR" | "overrideDailyTargetR",
	})
}

const RCapOverridePopover = ({
	level,
	planRowId,
	fieldKey,
	fieldLabel,
	currentValue,
	currentSource,
	idPrefix,
}: RCapOverridePopoverProps) => {
	const router = useRouter()
	const { showToast } = useToast()
	const t = useTranslations("plan.rCapOverride")
	const [open, setOpen] = useState(false)
	const [draft, setDraft] = useState("")
	const [isPending, startTransition] = useTransition()

	const isOverridden = currentSource === level

	const handleSave = () => {
		const num = parseFloat(draft.replace(",", "."))
		if (!Number.isFinite(num) || num <= 0) {
			showToast("error", t("mustBePositive", { fieldLabel }))
			return
		}
		startTransition(async () => {
			const result = await callUpsert(level, planRowId, fieldKey, num)
			if (result.status === "success") {
				showToast("success", t("setSuccess", { level, value: num.toFixed(2) }))
				setOpen(false)
				setDraft("")
				router.refresh()
			} else {
				showToast("error", result.message || t("saveFailed"))
			}
		})
	}

	const handleReset = () => {
		startTransition(async () => {
			const result = await callReset(level, planRowId, fieldKey)
			if (result.status === "success") {
				showToast("success", t("cleared"))
				setOpen(false)
				router.refresh()
			} else {
				showToast("error", result.message || t("resetFailed"))
			}
		})
	}

	return (
		<div className="gap-s-200 flex items-center">
			<span className="text-txt-100 font-mono text-lg">
				{formatR(currentValue)}
			</span>
			<ProvenanceBadge level={currentSource} isOverride={isOverridden} />
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						id={`${idPrefix}-trigger`}
						variant="ghost"
						size="sm"
						className="text-tiny text-txt-300 hover:text-txt-100 h-7 px-2"
						aria-label={t("editAriaLabel", { fieldLabel })}
					>
						<Settings2 className="h-3.5 w-3.5" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-72" align="end">
					<div className="space-y-s-300">
						<div>
							<p className="text-tiny text-txt-300 font-medium tracking-wider uppercase">
								{t("heading", { fieldLabel, level })}
							</p>
							<p className="text-tiny text-txt-300 mt-1">
								{t("currentFrom", { value: formatR(currentValue) })}{" "}
								<strong className="text-txt-200">{currentSource}</strong>
							</p>
						</div>
						<div>
							<Label
								id={`${idPrefix}-input-label`}
								htmlFor={`${idPrefix}-input`}
							>
								{t("newValueLabel")}
							</Label>
							<Input
								id={`${idPrefix}-input`}
								type="number"
								step="0.01"
								min="0.01"
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								placeholder={t("placeholder")}
								autoFocus
							/>
						</div>
						<div className="gap-s-200 flex items-center justify-between">
							<Button
								id={`${idPrefix}-reset`}
								variant="ghost"
								size="sm"
								onClick={handleReset}
								disabled={!isOverridden || isPending}
								className="text-tiny"
							>
								<RotateCcw className="mr-1 h-3 w-3" />
								{t("reset")}
							</Button>
							<Button
								id={`${idPrefix}-save`}
								size="sm"
								onClick={handleSave}
								disabled={isPending || !draft.trim()}
							>
								{isPending ? (
									<Loader2 className="mr-1 h-3 w-3 animate-spin motion-reduce:animate-none" />
								) : (
									<Save className="mr-1 h-3 w-3" />
								)}
								{t("save")}
							</Button>
						</div>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	)
}

export type { RCapOverridePopoverProps, Level as OverrideLevel, FieldKey }
export { RCapOverridePopover }
