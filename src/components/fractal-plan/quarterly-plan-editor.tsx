"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { upsertQuarterlyPlan } from "@/app/actions/fractal-plan/quarterly"

interface QuarterlyPlanEditorProps {
	quarterlyPlanId: string
	existing: {
		goalCents: number | null
		reflectionNotes: string | null
		postMortemNotes: string | null
	}
}

const QuarterlyPlanEditor = ({
	quarterlyPlanId,
	existing,
}: QuarterlyPlanEditorProps) => {
	const router = useRouter()
	const { showToast } = useToast()
	const t = useTranslations("plan")
	const [isPending, startTransition] = useTransition()

	const [goalBRL, setGoalBRL] = useState(
		existing.goalCents !== null ? (existing.goalCents / 100).toFixed(2) : ""
	)
	const [reflectionNotes, setReflectionNotes] = useState(
		existing.reflectionNotes ?? ""
	)
	const [postMortemNotes, setPostMortemNotes] = useState(
		existing.postMortemNotes ?? ""
	)

	const handleSubmit = () => {
		const goalCents = goalBRL.trim()
			? Math.round(parseFloat(goalBRL.replace(",", ".")) * 100)
			: undefined
		if (
			goalCents !== undefined &&
			(!Number.isFinite(goalCents) || goalCents < 0)
		) {
			showToast("error", t("editors.goalError"))
			return
		}

		startTransition(async () => {
			const result = await upsertQuarterlyPlan({
				quarterlyPlanId,
				goalCents,
				reflectionNotes: reflectionNotes || undefined,
				postMortemNotes: postMortemNotes || undefined,
			})
			if (result.status === "success") {
				showToast("success", t("editors.quarterly.saveSuccess"))
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
				<Label id="lbl-quarter-goal" htmlFor="quarter-goal">
					{t("editors.quarterly.goalLabel")}
				</Label>
				<Input
					id="quarter-goal"
					type="number"
					step="0.01"
					min="0"
					value={goalBRL}
					onChange={(e) => setGoalBRL(e.target.value)}
				/>
			</div>
			<div>
				<Label id="lbl-quarter-intent" htmlFor="quarter-intent">
					{t("editors.quarterly.reflectionLabel")}
				</Label>
				<Textarea
					id="quarter-intent"
					rows={3}
					value={reflectionNotes}
					onChange={(e) => setReflectionNotes(e.target.value)}
					placeholder={t("editors.quarterly.reflectionPlaceholder")}
				/>
			</div>
			<div>
				<Label id="lbl-quarter-postmortem" htmlFor="quarter-postmortem">
					{t("editors.quarterly.postMortemLabel")}
				</Label>
				<Textarea
					id="quarter-postmortem"
					rows={3}
					value={postMortemNotes}
					onChange={(e) => setPostMortemNotes(e.target.value)}
					placeholder={t("editors.quarterly.postMortemPlaceholder")}
				/>
			</div>
			<div className="flex justify-end">
				<Button id="btn-quarter-save" type="submit" disabled={isPending}>
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

export type { QuarterlyPlanEditorProps }
export { QuarterlyPlanEditor }
