"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { upsertMonthlyPlan } from "@/app/actions/fractal-plan/monthly"
import { RiskProfilePicker } from "@/components/fractal-plan/risk-profile-picker"
import type { RiskManagementProfile } from "@/types/risk-profile"

interface MonthlyPlanEditorProps {
	monthlyPlanId: string
	riskProfiles: RiskManagementProfile[]
	existing: {
		monthlyGoalCents: number | null
		intentNotes: string | null
		postMortemNotes: string | null
		overrideRiskProfileId: string | null
	}
}

const MonthlyPlanEditor = ({
	monthlyPlanId,
	riskProfiles,
	existing,
}: MonthlyPlanEditorProps) => {
	const router = useRouter()
	const { showToast } = useToast()
	const t = useTranslations("plan")
	const [isPending, startTransition] = useTransition()

	const [goalCents, setGoalCents] = useState<number | null>(
		existing.monthlyGoalCents
	)
	const [intentNotes, setIntentNotes] = useState(existing.intentNotes ?? "")
	const [postMortemNotes, setPostMortemNotes] = useState(
		existing.postMortemNotes ?? ""
	)
	const [riskProfileId, setRiskProfileId] = useState<string | null>(
		existing.overrideRiskProfileId
	)

	const handleSubmit = () => {
		const monthlyGoalCents =
			goalCents !== null ? Math.round(goalCents) : undefined
		if (
			monthlyGoalCents !== undefined &&
			(!Number.isFinite(monthlyGoalCents) || monthlyGoalCents < 0)
		) {
			showToast("error", t("editors.goalError"))
			return
		}

		startTransition(async () => {
			const result = await upsertMonthlyPlan({
				monthlyPlanId,
				monthlyGoalCents,
				intentNotes: intentNotes || undefined,
				postMortemNotes: postMortemNotes || undefined,
				overrideRiskProfileId: riskProfileId,
			})
			if (result.status === "success") {
				showToast("success", t("editors.monthly.saveSuccess"))
				router.refresh()
			} else {
				showToast("error", result.message || t("editors.saveFailed"))
			}
		})
	}

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				handleSubmit()
			}}
			className="space-y-m-400"
		>
			<div>
				<Label id="lbl-month-risk-profile" htmlFor="month-risk-profile">
					{t("editors.monthly.riskProfileLabel")}
				</Label>
				<RiskProfilePicker
					id="month-risk-profile"
					profiles={riskProfiles}
					value={riskProfileId}
					onChange={setRiskProfileId}
				/>
			</div>
			<div>
				<Label id="lbl-month-goal" htmlFor="month-goal">
					{t("editors.monthly.goalLabel")}
				</Label>
				<CurrencyInput
					id="month-goal"
					value={goalCents}
					onValueChange={setGoalCents}
					decimals={2}
					unit="cents"
				/>
			</div>
			<div>
				<Label id="lbl-month-intent" htmlFor="month-intent">
					{t("editors.monthly.intentLabel")}
				</Label>
				<Textarea
					id="month-intent"
					rows={3}
					value={intentNotes}
					onChange={(e) => setIntentNotes(e.target.value)}
					placeholder={t("editors.monthly.intentPlaceholder")}
				/>
			</div>
			<div>
				<Label id="lbl-month-postmortem" htmlFor="month-postmortem">
					{t("editors.monthly.postMortemLabel")}
				</Label>
				<Textarea
					id="month-postmortem"
					rows={3}
					value={postMortemNotes}
					onChange={(e) => setPostMortemNotes(e.target.value)}
					placeholder={t("editors.monthly.postMortemPlaceholder")}
				/>
			</div>
			<div className="flex justify-end">
				<Button id="btn-month-save" type="submit" disabled={isPending}>
					{isPending ? (
						<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
					) : (
						<Save className="mr-s-200 h-4 w-4" />
					)}
					{t("editors.save")}
				</Button>
			</div>
		</form>
	)
}

export type { MonthlyPlanEditorProps }
export { MonthlyPlanEditor }
